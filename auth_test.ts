import 'jasmine';
import {signOauthState, verifyOauthState} from './auth';
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
