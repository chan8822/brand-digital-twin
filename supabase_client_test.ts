import 'jasmine';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {BaseError} from './errors';
import {SupabaseClient} from './supabase_client';

describe('SupabaseClient Database & Security Suite', () => {
  let db: SupabaseClient;

  beforeEach(() => {
    SupabaseClient.useSharedMockDb = false;
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

  describe('Versioned Database Migrations (P1.4a)', () => {
    const tempMigrationsDir = path.join(process.env['TEST_TMPDIR'] || '/tmp', 'temp_migrations_test');

    beforeEach(() => {
      db.resetLocalMockDb();
      if (fs.existsSync(tempMigrationsDir)) {
        fs.rmSync(tempMigrationsDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempMigrationsDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tempMigrationsDir)) {
        fs.rmSync(tempMigrationsDir, { recursive: true, force: true });
      }
    });

    it('should run migrations in order on fresh database', async () => {
      fs.writeFileSync(path.join(tempMigrationsDir, '0001_init.sql'), 'CREATE TABLE t1 (id INT);');
      fs.writeFileSync(path.join(tempMigrationsDir, '0002_add_cols.sql'), 'ALTER TABLE t1 ADD COLUMN name TEXT;');

      const res = await db.runMigrations(tempMigrationsDir);
      expect(res.applied.length).toBe(2);
      expect(res.applied[0]).toBe('0001_init.sql');
      expect(res.applied[1]).toBe('0002_add_cols.sql');

      const res2 = await db.runMigrations(tempMigrationsDir);
      expect(res2.applied.length).toBe(0);
    });

    it('should show pending migrations but not apply them in dry-run mode', async () => {
      fs.writeFileSync(path.join(tempMigrationsDir, '0001_init.sql'), 'CREATE TABLE t1 (id INT);');

      const dryRunRes = await db.runMigrations(tempMigrationsDir, { dryRun: true });
      expect(dryRunRes.applied.length).toBe(1);
      expect(dryRunRes.applied[0]).toBe('0001_init.sql');

      const res = await db.runMigrations(tempMigrationsDir);
      expect(res.applied.length).toBe(1);
      expect(res.applied[0]).toBe('0001_init.sql');
    });

    it('should reject already applied migrations if local file checksum changed', async () => {
      fs.writeFileSync(path.join(tempMigrationsDir, '0001_init.sql'), 'CREATE TABLE t1 (id INT);');

      await db.runMigrations(tempMigrationsDir);

      fs.writeFileSync(path.join(tempMigrationsDir, '0001_init.sql'), 'CREATE TABLE t1 (id INT, modified INT);');

      await expectAsync(
        db.runMigrations(tempMigrationsDir)
      ).toBeRejectedWithError(/checksum mismatch/i);
    });

    it('should reject invalid migration filename formats', async () => {
      fs.writeFileSync(path.join(tempMigrationsDir, 'init.sql'), 'CREATE TABLE t1 (id INT);');

      await expectAsync(
        db.runMigrations(tempMigrationsDir)
      ).toBeRejectedWithError(/invalid migration filename format/i);
    });
  });

  describe('Database Backup & Restore Drill (P1.4b)', () => {
    it('should export database backup snapshot and restore it successfully resetting modified state', async () => {
      db.resetLocalMockDb();

      await db.saveClient({
        clientId: 'client-1',
        orgId: 'tenant-a',
        name: 'Client Nike',
        mrr: 5000,
        marginTarget: 0.3,
        healthScore: 90,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      const initialBackup = await db.exportBackup();

      await db.saveClient({
        clientId: 'client-1',
        orgId: 'tenant-a',
        name: 'Client Nike V2',
        mrr: 8000,
        marginTarget: 0.3,
        healthScore: 95,
        churnRisk: 0.05,
        tenantId: 'tenant-a',
      });

      await db.saveClient({
        clientId: 'client-2',
        orgId: 'tenant-a',
        name: 'Client Adidas',
        mrr: 3000,
        marginTarget: 0.2,
        healthScore: 80,
        churnRisk: 0.1,
        tenantId: 'tenant-a',
      });

      const stateBeforeRestore = await db.getClients('tenant-a');
      expect(stateBeforeRestore.length).toBe(2);
      expect(stateBeforeRestore.find(c => c.clientId === 'client-1')?.name).toBe('Client Nike V2');

      await db.restoreBackup(initialBackup);

      const stateAfterRestore = await db.getClients('tenant-a');
      expect(stateAfterRestore.length).toBe(1);
      expect(stateAfterRestore[0].clientId).toBe('client-1');
      expect(stateAfterRestore[0].name).toBe('Client Nike');
      expect(stateAfterRestore[0].mrr).toBe(5000);
    });
  });
});
