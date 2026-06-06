import * as crypto from 'crypto';
import {config} from './config';
import {signJwt, verifyJwt} from './auth';
import {SupabaseClient, UserEntry, RefreshTokenEntry, OrgEntry, LegalAcceptanceEntry} from './supabase_client';
import {AuthError} from './errors';

// Session config constants
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hashes a password using native crypto.scrypt.
 * Returns salt and hash formatted as salt:hash
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against a stored scrypt salt:hash.
 * Uses timingSafeEqual to avoid timing side-channel attacks.
 */
export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      resolve(false);
      return;
    }
    const [salt, hash] = parts;
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        resolve(false);
        return;
      }
      const a = Buffer.from(derivedKey.toString('hex'), 'hex');
      const b = Buffer.from(hash, 'hex');
      if (a.length !== b.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(new Uint8Array(a), new Uint8Array(b)));
    });
  });
}

/**
 * Hashes a raw refresh token using SHA-256 for secure storage.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Signs up a new user, hashes their credentials, and creates a default org.
 * Returns the created user profile and a signed verification token.
 */
export async function signup(
  db: SupabaseClient,
  email: string,
  password: string,
  orgName: string,
  secret: string,
  policyAccepted?: boolean,
  acceptedVersion?: string,
  ipAddress?: string | null,
): Promise<{user: UserEntry; verificationToken: string}> {
  if (config.legal.activeVersion) {
    if (!policyAccepted) {
      throw new AuthError('Terms and conditions must be accepted to register');
    }
    if (acceptedVersion !== config.legal.activeVersion) {
      throw new AuthError(`You must accept the active terms version (${config.legal.activeVersion})`);
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AuthError('Invalid email format');
  }

  if (!password || password.length < 8) {
    throw new AuthError('Password must be at least 8 characters long');
  }

  const existing = await db.getUserByEmail(email);
  if (existing) {
    throw new AuthError('User already exists');
  }

  const pwHash = await hashPassword(password);
  const userId = `usr_${crypto.randomUUID()}`;

  const user: UserEntry = {
    user_id: userId,
    email,
    pw_hash: pwHash,
    status: 'pending_verification',
    created_at: new Date().toISOString(),
  };

  await db.saveUser(user);

  if (policyAccepted) {
    const acceptance: LegalAcceptanceEntry = {
      acceptance_id: `acpt_${crypto.randomUUID()}`,
      user_id: userId,
      doc_version: acceptedVersion || 'v1.0',
      ip_address: ipAddress || null,
      accepted_at: new Date().toISOString(),
    };
    await db.saveLegalAcceptance(acceptance);
  }

  // Create organization
  const orgId = `org_${crypto.randomUUID()}`;
  const org: OrgEntry = {
    org_id: orgId,
    name: orgName,
    owner_user: userId,
    plan: 'trial',
    created_at: new Date().toISOString(),
  };
  await db.saveOrg(org);

  // Add user to organization
  await db.saveOrgMember({
    org_id: orgId,
    user_id: userId,
    role: 'owner',
  });

  // Create verification token (signed stateless JWT)
  const verificationToken = signJwt(
    {
      userId,
      orgId,
      role: 'owner',
    },
    secret,
    VERIFICATION_TOKEN_TTL_MS,
  );

  return {user, verificationToken};
}

/**
 * Verifies email verification token and activates user.
 */
export async function verifyEmail(
  db: SupabaseClient,
  token: string,
  secret: string,
): Promise<boolean> {
  try {
    const payload = verifyJwt(token, secret);
    const user = await db.getUserById(payload.userId);
    if (!user) return false;
    if (user.status !== 'pending_verification') return false;

    user.status = 'active';
    await db.saveUser(user);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates credentials and returns a session token pair.
 */
export async function login(
  db: SupabaseClient,
  email: string,
  password: string,
  secret: string,
): Promise<{accessToken: string; refreshToken: string}> {
  const user = await db.getUserByEmail(email);
  if (!user) {
    throw new AuthError('Invalid credentials');
  }

  if (user.status === 'pending_verification') {
    throw new AuthError('Email verification required');
  }

  if (user.status === 'disabled') {
    throw new AuthError('Account suspended');
  }

  const matches = await verifyPassword(password, user.pw_hash);
  if (!matches) {
    throw new AuthError('Invalid credentials');
  }

  // Find primary org
  const orgs = await db.getUserOrgs(user.user_id);
  const primaryOrg = orgs[0];
  const orgId = primaryOrg ? primaryOrg.org_id : '';
  const members = await db.getOrgMembers(orgId);
  const userRole = members.find(m => m.user_id === user.user_id)?.role || 'member';

  const accessToken = signJwt(
    {
      userId: user.user_id,
      orgId,
      role: userRole,
    },
    secret,
    ACCESS_TOKEN_TTL_MS,
  );

  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);

  const refreshToken: RefreshTokenEntry = {
    token_hash: tokenHash,
    user_id: user.user_id,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    revoked: false,
    created_at: new Date().toISOString(),
  };

  await db.saveRefreshToken(refreshToken);

  return {accessToken, refreshToken: rawRefreshToken};
}

/**
 * Rotates a refresh token: revokes old token and generates a new pair.
 */
export async function rotateRefreshToken(
  db: SupabaseClient,
  rawRefreshToken: string,
  secret: string,
): Promise<{accessToken: string; refreshToken: string}> {
  const hash = hashToken(rawRefreshToken);
  const storedToken = await db.getRefreshTokenHash(hash);

  if (!storedToken) {
    throw new AuthError('Invalid refresh token');
  }

  if (storedToken.revoked || new Date(storedToken.expires_at).getTime() < Date.now()) {
    // Abuse detection: if a revoked refresh token is re-presented, revoke all tokens for that user!
    const tokens = await db.getRefreshTokensForUser(storedToken.user_id);
    for (const t of tokens) {
      t.revoked = true;
      await db.saveRefreshToken(t);
    }
    throw new AuthError('Token compromised: session revoked');
  }

  // Revoke the old token
  storedToken.revoked = true;
  await db.saveRefreshToken(storedToken);

  // Generate new pair
  const user = await db.getUserById(storedToken.user_id);
  if (!user || user.status !== 'active') {
    throw new AuthError('User account inactive');
  }

  const orgs = await db.getUserOrgs(user.user_id);
  const primaryOrg = orgs[0];
  const orgId = primaryOrg ? primaryOrg.org_id : '';
  const members = await db.getOrgMembers(orgId);
  const userRole = members.find(m => m.user_id === user.user_id)?.role || 'member';

  const newAccessToken = signJwt(
    {
      userId: user.user_id,
      orgId,
      role: userRole,
    },
    secret,
    ACCESS_TOKEN_TTL_MS,
  );

  const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
  const newTokenHash = hashToken(newRawRefreshToken);

  const newRefreshToken: RefreshTokenEntry = {
    token_hash: newTokenHash,
    user_id: user.user_id,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
    revoked: false,
    created_at: new Date().toISOString(),
  };

  await db.saveRefreshToken(newRefreshToken);

  return {accessToken: newAccessToken, refreshToken: newRawRefreshToken};
}

/**
 * Initiates the password reset flow.
 * Returns a signed, short-lived reset token.
 */
export async function requestPasswordReset(
  db: SupabaseClient,
  email: string,
  secret: string
): Promise<string> {
  const user = await db.getUserByEmail(email);
  if (!user) {
    throw new AuthError('User not found');
  }

  const orgs = await db.getUserOrgs(user.user_id);
  const orgId = orgs[0]?.org_id || '';
  const members = await db.getOrgMembers(orgId);
  const role = members.find(m => m.user_id === user.user_id)?.role || 'member';

  const resetToken = signJwt(
    {
      userId: user.user_id,
      orgId,
      role,
      purpose: 'password_reset',
    },
    secret,
    60 * 60 * 1000 // 1 hour expiration
  );

  return resetToken;
}

/**
 * Confirms and updates the user's password using a verification token.
 * Invalidate all refresh tokens to force re-login.
 */
export async function confirmPasswordReset(
  db: SupabaseClient,
  token: string,
  newPassword: string,
  secret: string
): Promise<void> {
  let payload;
  try {
    payload = verifyJwt(token, secret);
  } catch {
    throw new AuthError('Expired or invalid reset token');
  }

  if (payload.purpose !== 'password_reset') {
    throw new AuthError('Invalid token purpose');
  }

  const user = await db.getUserById(payload.userId);
  if (!user || user.status === 'disabled') {
    throw new AuthError('User account inactive or not found');
  }

  const pwHash = await hashPassword(newPassword);
  user.pw_hash = pwHash;
  await db.saveUser(user);

  // Invalidate all refresh tokens for user
  await db.revokeAllRefreshTokensForUser(user.user_id);
}

