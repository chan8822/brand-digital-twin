import 'jasmine';
import {BaseError} from './errors';
import {SupabaseClient} from './supabase_client';

describe('SupabaseClient Database & Security Suite', () => {
  let db: SupabaseClient;

  beforeEach(() => {
    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
  });

  describe('Cloning & Shared State', () => {
    it('should clone the client instance but share in-memory tables by reference', async () => {
      const clone = db.clone();
      expect(clone).not.toBe(db);

      // Save client in original instance
      await db.saveClient({
        clientId: 'client-1',
        orgId: 'tenant-a',
        name: 'Client A',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      // Verify clone has access to the same client
      const clientsOnClone = await clone.getClients('tenant-a');
      expect(clientsOnClone.length).toBe(1);
      expect(clientsOnClone[0].clientId).toBe('client-1');

      // Verify that changes on clone are reflected in original
      await clone.saveClient({
        clientId: 'client-2',
        orgId: 'tenant-a',
        name: 'Client A V2',
        mrr: 6000,
        marginTarget: 0.3,
        healthScore: 95,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      const clientsOnOriginal = await db.getClients('tenant-a');
      expect(clientsOriginalCount(clientsOnOriginal)).toBe(2);
    });

    function clientsOriginalCount(clients: any[]) {
      return clients.length;
    }
  });

  describe('Row-Level Security (RLS) Isolation', () => {
    it('should allow queries matching the active tenant context', async () => {
      db.setTenantContext('tenant-a');
      await db.saveClient({
        clientId: 'client-a',
        orgId: 'tenant-a',
        name: 'Client A',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      const clients = await db.getClients('tenant-a');
      expect(clients.length).toBe(1);
    });

    it('should throw RLS_VIOLATION if query tenant mismatches active tenant context', async () => {
      db.setTenantContext('tenant-a');

      await expectAsync(
        db.saveClient({
          clientId: 'client-b',
          orgId: 'tenant-b',
          name: 'Client B',
          mrr: 5000,
          marginTarget: 0.3,
          healthScore: 90,
          churnRisk: 0.05,
          tenantId: 'tenant-b', // mismatched target tenant
        })
      ).toBeRejectedWithError(/Row-level security violation/);

      await expectAsync(db.getClients('tenant-b')).toBeRejectedWithError(/Row-level security violation/);
    });

    it('should bypass RLS checks if active tenant context is null', async () => {
      db.setTenantContext(null);

      // Save client for tenant-a
      await db.saveClient({
        clientId: 'client-a',
        orgId: 'tenant-a',
        name: 'Client A',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      // Save client for tenant-b
      await db.saveClient({
        clientId: 'client-b',
        orgId: 'tenant-b',
        name: 'Client B',
        mrr: 7000,
        marginTarget: 0.3,
        healthScore: 85,
        churnRisk: 0.1,
        tenantId: 'tenant-b',
      });

      const clientsA = await db.getClients('tenant-a');
      expect(clientsA.length).toBe(1);

      const clientsB = await db.getClients('tenant-b');
      expect(clientsB.length).toBe(1);
    });
  });

  describe('Functional Mock Transactions', () => {
    it('should rollback database changes if transaction rolls back', async () => {
      db.setTenantContext(null); // Bypass RLS for setup

      await db.saveClient({
        clientId: 'client-initial',
        orgId: 'tenant-a',
        name: 'Initial Client',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      await db.beginTransaction();

      // Mutate existing and insert new
      await db.saveClient({
        clientId: 'client-initial',
        orgId: 'tenant-a',
        name: 'Initial Client Modified',
        mrr: 6000,
        marginTarget: 0.3,
        healthScore: 95,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      await db.saveClient({
        clientId: 'client-new',
        orgId: 'tenant-a',
        name: 'New Client during TX',
        mrr: 3000,
        marginTarget: 0.3,
        healthScore: 80,
        churnRisk: 0.1,
        tenantId: 'tenant-a',
      });

      // Assert they are modified in-memory before rollback
      let clients = await db.getClients('tenant-a');
      expect(clients.length).toBe(2);
      expect(clients.find(c => c.clientId === 'client-initial')?.name).toBe('Initial Client Modified');

      await db.rollbackTransaction();

      // Revert to initial state
      clients = await db.getClients('tenant-a');
      expect(clients.length).toBe(1);
      expect(clients[0].clientId).toBe('client-initial');
      expect(clients[0].name).toBe('Initial Client');
    });

    it('should keep database changes if transaction commits', async () => {
      db.setTenantContext(null);

      await db.saveClient({
        clientId: 'client-initial',
        orgId: 'tenant-a',
        name: 'Initial Client',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      await db.beginTransaction();

      await db.saveClient({
        clientId: 'client-initial',
        orgId: 'tenant-a',
        name: 'Initial Client Modified',
        mrr: 6000,
        marginTarget: 0.3,
        healthScore: 95,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      await db.commitTransaction();

      const clients = await db.getClients('tenant-a');
      expect(clients.length).toBe(1);
      expect(clients[0].name).toBe('Initial Client Modified');
    });
  });

  describe('Atomic Distributed Locks', () => {
    it('should acquire lock successfully if not held', async () => {
      const acquired = await db.acquireLock('camp-1', 'node-1', 5000);
      expect(acquired).toBe(true);
    });

    it('should fail to acquire lock if already held by another owner and not expired', async () => {
      const first = await db.acquireLock('camp-1', 'node-1', 5000);
      expect(first).toBe(true);

      const second = await db.acquireLock('camp-1', 'node-2', 5000);
      expect(second).toBe(false);
    });

    it('should allow acquisition if existing lock has expired', async () => {
      const first = await db.acquireLock('camp-1', 'node-1', 50); // extremely short lease
      expect(first).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 60)); // wait for expiration

      const second = await db.acquireLock('camp-1', 'node-2', 5000);
      expect(second).toBe(true);
    });

    it('should release lock, making it available for acquisition again', async () => {
      await db.acquireLock('camp-1', 'node-1', 5000);
      await db.releaseLock('camp-1', 'node-1');

      const second = await db.acquireLock('camp-1', 'node-2', 5000);
      expect(second).toBe(true);
    });
  });
});
