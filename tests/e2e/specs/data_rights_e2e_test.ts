import 'jasmine';
import * as http from 'http';
import {signJwt} from '../../../auth';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

describe('Data Rights E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9981;
  const baseUrl = `http://localhost:${PORT}`;
  const jwtSecret = config.auth.jwtSecret;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  beforeEach(() => {
    resetRateLimiters();
    db.resetLocalMockDb();
  });

  afterAll((done) => {
    server.close(done);
  });

  function getJson(path: string, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(`${baseUrl}${path}`);
      http.get({
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: parsed.pathname + parsed.search,
        headers: headers || {},
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }).on('error', reject);
    });
  }

  function postJson(path: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  function deleteReq(path: string, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path,
        method: 'DELETE',
        headers: headers || {},
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }


  describe('R1: GDPR Data Rights & Hard Delete Cascade', () => {
    let accessToken: string;
    let userId: string;
    let orgId: string;

    beforeEach(async () => {
      const email = 'datarights@example.com';
      const pw = 'Password123!';
      const orgName = 'DataRightsOrg';

      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        const orgs = await db.getUserOrgs(existingUser.user_id);
        for (const o of orgs) {
          await db.deleteOrg(o.org_id);
          await db.hardDeleteTenantData(o.org_id);
        }
        await db.deleteUser(existingUser.user_id);
      }

      const { user, verificationToken } = await signup(db, email, pw, orgName, jwtSecret, true, config.legal.activeVersion || 'v1.0');
      await verifyEmail(db, verificationToken, jwtSecret);

      const loginRes = await login(db, email, pw, jwtSecret);
      accessToken = loginRes.accessToken;
      userId = user.user_id;
      const userOrgs = await db.getUserOrgs(userId);
      orgId = userOrgs[0].org_id;

      // Clean existing data for this tenant
      await db.hardDeleteTenantData(orgId);

      // Inject data for tenant/orgId
      await db.savePlatformAccount({
        account_id: 'pa-1',
        tenant_id: orgId,
        platform: 'google',
        platform_account_id: 'g-acc-1',
        account_name: 'Google Ads Account',
        account_type: 'ads',
        status: 'active',
        ingested_at: new Date().toISOString(),
      });

      await db.saveCampaign({
        campaign_id: 'camp-1',
        platform: 'google',
        name: 'GDPR Campaign',
        objective: 'leads',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: 'camp-1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      await db.saveOrder({
        order_id: 'order-1',
        customer_id: 'cust-1',
        account_id: 'pa-1',
        channel: 'online',
        surface: 'web',
        placed_at: new Date().toISOString(),
        currency: 'USD',
        gross_revenue: 100,
        total_discounts: 0,
        total_tax: 8,
        shipping_charged: 5,
        status: 'completed',
        tenant_id: orgId,
        source_system: 'shopify',
        source_id: 'order-1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      await db.saveTouchpoint({
        touchpoint_id: 'tp-1',
        customer_id: 'cust-1',
        campaign_id: 'camp-1',
        order_id: 'order-1',
        occurred_at: new Date().toISOString(),
        type: 'click',
        tenant_id: orgId,
        source_system: 'sgtm',
        ingested_at: new Date().toISOString(),
      });

      await db.saveCredential({
        tenant_id: orgId,
        platform: 'google',
        credential_key: 'dev_token',
        encrypted_value: 'enc-token-123',
        refresh_token: 'refresh-123',
        expires_at: null,
        updated_at: new Date().toISOString(),
      });

      await db.saveIntegrationState({
        integrationId: 'int-1',
        tenantId: orgId,
        provider: 'google_ads',
        status: 'active',
        updatedAt: Date.now(),
        settings: {},
      });
    });

    it('1. Cascade Deletion on Account Purge', async () => {
      const delRes = await deleteReq('/api/v1/account', { 'Authorization': `Bearer ${accessToken}` });
      expect(delRes.status).toBe(200);

      // Verify User is soft-deleted/disabled
      const user = await db.getUserById(userId);
      expect(user?.status).toBe('disabled');
      expect(user?.deleted_at).toBeDefined();

      // Verify Org is soft-deleted
      const org = await db.getOrg(orgId);
      expect(org?.deleted_at).toBeDefined();

      // Run hardDeleteTenantData
      await db.hardDeleteTenantData(orgId);

      // Verify all tenant table data is removed
      const platformAccounts = await db.getPlatformAccounts(orgId);
      expect(platformAccounts.length).toBe(0);

      const clients = await db.getClients(orgId);
      expect(clients.length).toBe(0);

      const campaigns = await db.getCampaigns(orgId);
      expect(campaigns.length).toBe(0);

      const orders = await db.getOrders(orgId);
      expect(orders.length).toBe(0);

      const touchpoints = await db.getTouchpoints(orgId);
      expect(touchpoints.length).toBe(0);

      const credentials = await db.getCredentials(orgId);
      expect(credentials.length).toBe(0);

      const integrationStates = await db.getIntegrationStates(orgId);
      expect(integrationStates.length).toBe(0);
    });

    it('2. 30-Day Soft Grace Period Check', async () => {
      const delRes = await deleteReq('/api/v1/account', { 'Authorization': `Bearer ${accessToken}` });
      expect(delRes.status).toBe(200);

      // Verify grace period deletionDate is set to ~30 days in the future
      const { deletionDate, status } = delRes.body.data;
      expect(status).toBe('scheduled');

      const expectedDateMs = Date.now() + 30 * 24 * 3600 * 1000;
      const actualDateMs = Date.parse(deletionDate);
      expect(Math.abs(actualDateMs - expectedDateMs)).toBeLessThan(10000); // within 10s tolerance

      // Verify job is pending
      const pendingJobs = await db.getPendingJobs(orgId);
      const deleteJob = pendingJobs.find(j => j.type === 'hard_delete_account');
      expect(deleteJob).toBeDefined();
      expect(deleteJob?.status).toBe('pending');
    });

    it('3. Signed JSON Export Download', async () => {
      const exportRes = await postJson('/api/v1/account/export', {}, { 'Authorization': `Bearer ${accessToken}` });
      expect(exportRes.status).toBe(200);
      const { downloadUrl, expiresIn } = exportRes.body.data;
      expect(downloadUrl).toContain('/api/v1/account/export/download?token=');
      expect(expiresIn).toBe('15m');

      // Request download
      const relativeUrl = downloadUrl.replace(config.server.baseUrl, '');
      const downloadRes = await getJson(relativeUrl);
      expect(downloadRes.status).toBe(200);

      const payload = downloadRes.body;
      expect(payload.tenantId).toBe(orgId);
      expect(payload.campaigns.length).toBe(1);
      expect(payload.campaigns[0].campaign_id).toBe('camp-1');
      expect(payload.orders.length).toBe(1);
      expect(payload.orders[0].order_id).toBe('order-1');
    });

    it('4. Purge Credential Vault', async () => {
      // Credentials exist before purge
      const credsBefore = await db.getCredentials(orgId);
      expect(credsBefore.length).toBe(1);

      // Purge tenant data
      await db.hardDeleteTenantData(orgId);

      // Credentials are completely filtered out
      const credsAfter = await db.getCredentials(orgId);
      expect(credsAfter.length).toBe(0);
    });

    it('5. Anonymized Logging Preservation', async () => {
      // Log some audit entries and governance events
      await db.logAudit({
        tenant: orgId,
        timestamp: new Date().toISOString(),
        action_id: 'action-1',
        op: 'pause',
        entity: 'campaign',
        target_id: 'camp-1',
        cost: 0,
        decision: 'ALLOW',
        reason: 'Sensitive reason details here',
      });

      await db.saveGovernanceEvent({
        action_id: 'action-1',
        tenant_id: orgId,
        actor: 'user-sensitive-actor',
        action_type: 'pause',
        target_entity: 'campaign',
        status: 'ALLOW',
        reason: 'Sensitive reason details here',
        created_at: new Date().toISOString(),
      });

      // Anonymize
      await db.anonymizeLogs(orgId);

      // Verify preserved lengths
      const auditLogs = await db.getAuditLogs(orgId);
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].reason).toBe('[SCRUBBED]');

      const govEvents = await db.getGovernanceEvents(orgId);
      expect(govEvents.length).toBe(1);
      expect(govEvents[0].actor).toBe('[REDACTED]');
      expect(govEvents[0].reason).toBe('[SCRUBBED]');
    });
  });
});
