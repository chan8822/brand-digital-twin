import {signJwt, signOauthState, verifyJwt, verifyOauthState} from './auth';
import {AuthError} from './errors';

describe('Auth Helpers - OAuth State', () => {
  const secret = 'some_secure_oauth_state_secret_123';

  it('should sign and verify oauth state token successfully', () => {
    const tenantId = 'org-123';
    const userId = 'user-456';
    const platform = 'google_ads';

    const token = signOauthState(tenantId, userId, platform, secret);
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3);

    const payload = verifyOauthState(token, secret);
    expect(payload.tenantId).toBe(tenantId);
    expect(payload.userId).toBe(userId);
    expect(payload.platform).toBe(platform);
  });

  it('should reject state token signed with a different secret', () => {
    const token = signOauthState('org-123', 'user-456', 'google_ads', secret);
    expect(() => verifyOauthState(token, 'different_secret_999')).toThrowError(
      AuthError,
      /signature/i
    );
  });
});

describe('JWT validation details', () => {
  const primarySecret = 'key-123';
  const secondarySecret = 'key-456';
  const rotationSecrets = 'key-123,key-456';

  it('should verify token with secondary key during rotation', () => {
    // Sign with secondary key
    const token = signJwt(
      {userId: 'u1', orgId: 'o1', role: 'media_buyer'},
      secondarySecret,
      60 * 1000
    );

    // Verify using both secrets
    const decoded = verifyJwt(token, rotationSecrets);
    expect(decoded.userId).toBe('u1');
    expect(decoded.role).toBe('media_buyer');
  });

  it('should reject token signed with an untrusted key', () => {
    const token = signJwt(
      {userId: 'u1', orgId: 'o1', role: 'media_buyer'},
      'untrusted-key',
      60 * 1000
    );

    expect(() => verifyJwt(token, rotationSecrets)).toThrowError(
      AuthError,
      /signature/i
    );
  });

  it('should reject token with algorithm confusion (none)', () => {
    const header = {alg: 'none', typ: 'JWT'};
    const payload = {userId: 'u1', orgId: 'o1', role: 'media_buyer', exp: Math.floor(Date.now() / 1000) + 60};
    
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${headerB64}.${payloadB64}.`; // signature empty

    expect(() => verifyJwt(token, primarySecret)).toThrowError(
      AuthError,
      /algorithm/i
    );
  });

  it('should reject token with algorithm confusion (HS384)', () => {
    const header = {alg: 'HS384', typ: 'JWT'};
    const payload = {userId: 'u1', orgId: 'o1', role: 'media_buyer', exp: Math.floor(Date.now() / 1000) + 60};
    
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${headerB64}.${payloadB64}.mocksignature`;

    expect(() => verifyJwt(token, primarySecret)).toThrowError(
      AuthError,
      /algorithm/i
    );
  });

  it('should reject expired tokens', () => {
    // Sign token that expired 5 seconds ago
    const token = signJwt(
      {userId: 'u1', orgId: 'o1', role: 'media_buyer'},
      primarySecret,
      -5 * 1000
    );

    expect(() => verifyJwt(token, primarySecret)).toThrowError(
      AuthError,
      /expired/i
    );
  });
});
