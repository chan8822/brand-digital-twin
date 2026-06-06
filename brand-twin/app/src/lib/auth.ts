/**
 * Auth API layer — wraps the live A1 endpoints (user_auth.ts @ 8807aa8):
 *   POST /auth/signup        {email, password, orgName} → {userId, verificationToken}
 *   POST /auth/verify        {token}                    → ok
 *   POST /auth/login         {email, password}          → {accessToken, refreshToken}
 *   POST /auth/reset         {email}                    → {resetToken}   (dev returns it)
 *   POST /auth/reset/confirm {token, newPassword}       → ok
 *
 * In MOCK mode (no NEXT_PUBLIC_API_URL) every call resolves locally so the auth
 * UX is demoable standalone. Errors surface the engine's `{error}` message.
 */
import { apiFetch, USE_MOCK, setAccessToken, setRefreshToken, setTenantId } from "./api";

export interface SignupResult {
  userId: string;
  verificationToken: string; // dev convenience — real flow emails it
}

export async function signup(
  email: string,
  password: string,
  orgName: string,
): Promise<SignupResult> {
  if (USE_MOCK) {
    await wait();
    return { userId: "usr_demo", verificationToken: "demo-verify-token" };
  }
  const data = await apiFetch<{ userId: string; verificationToken: string }>(
    "/api/v1/auth/signup",
    { method: "POST", body: JSON.stringify({ email, password, orgName }) },
  );
  return { userId: data.userId, verificationToken: data.verificationToken };
}

export async function verifyEmail(token: string): Promise<void> {
  if (USE_MOCK) return wait();
  await apiFetch<unknown>("/api/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function login(email: string, password: string): Promise<void> {
  if (USE_MOCK) {
    await wait();
    setAccessToken("demo-access-token");
    setTenantId("org-demo");
    return;
  }
  const data = await apiFetch<{ accessToken: string; refreshToken: string }>(
    "/api/v1/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
}

export function logout(): void {
  setAccessToken(null);
  setRefreshToken(null);
  setTenantId(null);
}

export async function requestReset(email: string): Promise<string | null> {
  if (USE_MOCK) {
    await wait();
    return "demo-reset-token";
  }
  const data = await apiFetch<{ resetToken?: string }>("/api/v1/auth/reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return data.resetToken ?? null;
}

export async function confirmReset(
  token: string,
  newPassword: string,
): Promise<void> {
  if (USE_MOCK) return wait();
  await apiFetch<unknown>("/api/v1/auth/reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export interface LegalDoc {
  title: string;
  version: string;
  content: string;
}

export async function fetchLegalDoc(docType: "tos" | "privacy" | "dpa"): Promise<LegalDoc> {
  if (USE_MOCK) {
    await wait();
    return {
      title: docType === "tos" ? "Terms of Service" : docType === "privacy" ? "Privacy Policy" : "Data Processing Addendum",
      version: "v1.0",
      content: `Standard ${docType.toUpperCase()} content for Brand Digital Twin OS... (Demo)`,
    };
  }
  return apiFetch<LegalDoc>(`/api/v1/legal/${docType}`);
}

export async function acceptLegalDoc(version: string): Promise<void> {
  if (USE_MOCK) return wait();
  await apiFetch<unknown>("/api/v1/legal/accept", {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

function wait(ms = 350) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
