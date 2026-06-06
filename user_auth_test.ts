import 'jasmine';
import * as crypto from 'crypto';
import {hashPassword, verifyPassword, signup, verifyEmail, login, rotateRefreshToken, requestPasswordReset, confirmPasswordReset} from './user_auth';
import {SupabaseClient} from './supabase_client';
import {AuthError} from './errors';

describe('UserAuth Systems', () => {
  let db: SupabaseClient;
  const jwtSecret = 'test_jwt_secret_xyz123';

  beforeEach(() => {
    db = new SupabaseClient('http://mock_url', 'mock_key');
    // Enable local mock DB to ensure complete test isolation
    SupabaseClient.useSharedMockDb = false;
  });

  describe('Password Hashing & Constant-time Verification', () => {
    it('should hash a password with random salt and verify it successfully', async () => {
      const pw = 'SuperSecret123!';
      const hash = await hashPassword(pw);
      expect(hash).toContain(':');

      const matches = await verifyPassword(pw, hash);
      expect(matches).toBeTrue();

      const wrongMatch = await verifyPassword('WrongPassword!', hash);
      expect(wrongMatch).toBeFalse();
    });

    it('should fail gracefully on corrupted hashes', async () => {
      const matches = await verifyPassword('test', 'badhash');
      expect(matches).toBeFalse();
    });
  });

  describe('User Registration & Verification Lifecycle', () => {
    it('should sign up, verify email, and log in successfully', async () => {
      const email = 'newuser@example.com';
      const pw = 'Password123!';
      const org = 'My First Org';

      // 1. Signup
      const {user, verificationToken} = await signup(db, email, pw, org, jwtSecret);
      expect(user.email).toBe(email);
      expect(user.status).toBe('pending_verification');
      expect(verificationToken).toBeDefined();

      // 2. Block login before verification
      await expectAsync(login(db, email, pw, jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Email verification required',
      );

      // 3. Verify Email
      const verifySuccess = await verifyEmail(db, verificationToken, jwtSecret);
      expect(verifySuccess).toBeTrue();

      const updatedUser = await db.getUserById(user.user_id);
      expect(updatedUser?.status).toBe('active');

      // 4. Login
      const {accessToken, refreshToken} = await login(db, email, pw, jwtSecret);
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
    });

    it('should reject signup for duplicate emails', async () => {
      const email = 'dup@example.com';
      await signup(db, email, 'Password123!', 'Org', jwtSecret);

      await expectAsync(signup(db, email, 'Password456!', 'Org2', jwtSecret)).toBeRejectedWithError(
        AuthError,
        'User already exists',
      );
    });

    it('should prevent duplicate email verification', async () => {
      const email = 'dupverify@example.com';
      const {verificationToken} = await signup(db, email, 'Password123!', 'OrgName', jwtSecret);

      const v1 = await verifyEmail(db, verificationToken, jwtSecret);
      expect(v1).toBeTrue();

      const v2 = await verifyEmail(db, verificationToken, jwtSecret);
      expect(v2).toBeFalse();
    });

    it('should reject signup for malformed emails', async () => {
      await expectAsync(
        signup(db, 'invalid-email', 'Password123!', 'Org', jwtSecret)
      ).toBeRejectedWithError(AuthError, 'Invalid email format');

      await expectAsync(
        signup(db, 'no-domain@', 'Password123!', 'Org', jwtSecret)
      ).toBeRejectedWithError(AuthError, 'Invalid email format');

      await expectAsync(
        signup(db, '@no-user.com', 'Password123!', 'Org', jwtSecret)
      ).toBeRejectedWithError(AuthError, 'Invalid email format');
    });

    it('should reject signup for weak/short passwords', async () => {
      await expectAsync(
        signup(db, 'valid@example.com', 'short', 'Org', jwtSecret)
      ).toBeRejectedWithError(AuthError, 'Password must be at least 8 characters long');

      await expectAsync(
        signup(db, 'valid@example.com', '', 'Org', jwtSecret)
      ).toBeRejectedWithError(AuthError, 'Password must be at least 8 characters long');
    });
  });

  describe('Refresh Token Rotation & Security', () => {
    it('should rotate refresh tokens and revoke old ones', async () => {
      const email = 'refresh@example.com';
      const pw = 'Password123!';
      const {user, verificationToken} = await signup(db, email, pw, 'Org', jwtSecret);
      await verifyEmail(db, verificationToken, jwtSecret);

      const {refreshToken} = await login(db, email, pw, jwtSecret);

      // Rotate once
      const rotation1 = await rotateRefreshToken(db, refreshToken, jwtSecret);
      expect(rotation1.accessToken).toBeDefined();
      expect(rotation1.refreshToken).not.toBe(refreshToken);

      // Attempting to reuse the old refresh token must trigger compromise detection and revoke all tokens!
      await expectAsync(rotateRefreshToken(db, refreshToken, jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Token compromised: session revoked',
      );

      // Verify all tokens for the user are now revoked
      const storedTokens = await db.getRefreshTokensForUser(user.user_id);
      expect(storedTokens.length).toBeGreaterThan(0);
      expect(storedTokens.every(t => t.revoked)).toBeTrue();
    });
  });

  describe('Password Reset Flow', () => {
    it('should request and confirm password reset, updating password and revoking refresh tokens', async () => {
      const email = 'reset_test@example.com';
      const pw = 'OldPassword123!';
      const newPw = 'NewPassword789!';

      // Signup and verify user
      const {user, verificationToken} = await signup(db, email, pw, 'Reset Org', jwtSecret);
      await verifyEmail(db, verificationToken, jwtSecret);

      // Login to generate a refresh token session
      const {refreshToken} = await login(db, email, pw, jwtSecret);
      let tokens = await db.getRefreshTokensForUser(user.user_id);
      expect(tokens.find(t => t.user_id === user.user_id && !t.revoked)).toBeDefined();

      // Request reset
      const resetToken = await requestPasswordReset(db, email, jwtSecret);
      expect(resetToken).toBeDefined();

      // Confirm reset
      await confirmPasswordReset(db, resetToken, newPw, jwtSecret);

      // Verify that old credentials no longer work
      await expectAsync(login(db, email, pw, jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Invalid credentials',
      );

      // Verify that new credentials work
      const loginSession = await login(db, email, newPw, jwtSecret);
      expect(loginSession.accessToken).toBeDefined();

      // Verify that all previous refresh tokens were revoked during reset
      tokens = await db.getRefreshTokensForUser(user.user_id);
      const oldTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const oldStoredToken = tokens.find(t => t.token_hash === oldTokenHash);
      expect(oldStoredToken?.revoked).toBeTrue();
    });

    it('should reject password reset request if user is not found', async () => {
      await expectAsync(requestPasswordReset(db, 'nonexistent@example.com', jwtSecret)).toBeRejectedWithError(
        AuthError,
        'User not found',
      );
    });

    it('should reject password reset confirmation with invalid token', async () => {
      await expectAsync(confirmPasswordReset(db, 'invalid_token', 'NewPw123!', jwtSecret)).toBeRejectedWithError(
        AuthError,
        'Expired or invalid reset token',
      );
    });
  });
});
