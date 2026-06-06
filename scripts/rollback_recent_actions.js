const http = require('http');
const crypto = require('crypto');

// Read config (simulated inline config read)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

const env = process.argv[2] || 'staging';
const port = parseInt(process.argv[3], 10) || 8081;

// Admin token to call API
const adminToken = signJwt(
  {
    userId: 'admin-deployer',
    orgId: 'test-tenant',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 300,
  },
  JWT_SECRET
);

console.log(`Connecting to server on port ${port} to fetch audit logs and reverse actions...`);

// For this simulation, we assume we know the actionId of the bad action we want to reverse.
const recentActionIds = ['action-rollback-test'];

async function reverseAction(actionId) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ reason: 'Automatic deployment rollback' });
    const req = http.request(
      {
        hostname: 'localhost',
        port: port,
        path: `/api/v1/actions/${actionId}/reverse`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${adminToken}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log(`Reverse action ${actionId} response:`, data);
          resolve(res.statusCode === 200);
        });
      }
    );
    req.on('error', (err) => {
      console.error(`Error reversing action ${actionId}:`, err.message);
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}

async function run() {
  for (const actionId of recentActionIds) {
    console.log(`Reversing action ${actionId}...`);
    const success = await reverseAction(actionId);
    if (success) {
      console.log(`Successfully reversed action ${actionId}`);
    } else {
      console.warn(`Failed to reverse action ${actionId}`);
    }
  }
}

run();
