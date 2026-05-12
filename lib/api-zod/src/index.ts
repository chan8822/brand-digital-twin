export * from "./generated/api";
export * from "./generated/types";

import { z } from "zod";

export const AuthUser = z.object({
  id: z.string(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const GetCurrentAuthUserResponse = z.object({
  user: AuthUser.nullable(),
});
export type GetCurrentAuthUserResponse = z.infer<
  typeof GetCurrentAuthUserResponse
>;

// --- Phone OTP (Twilio Verify) ---------------------------------------------

export const PhoneSendOtpBody = z.object({
  countryCode: z.string().min(2).max(5),
  phone: z.string().min(6).max(20),
});
export type PhoneSendOtpBody = z.infer<typeof PhoneSendOtpBody>;

export const PhoneSendOtpResponse = z.object({
  ok: z.boolean(),
  /** Present in dev/mock mode so the UI can show the code in a notice. */
  devCode: z.string().optional(),
});
export type PhoneSendOtpResponse = z.infer<typeof PhoneSendOtpResponse>;

// Optional attribution + consent payload sent on verify-otp. Server only
// persists the attribution fields on first user creation (first-touch), but
// always honours consent timestamps when they arrive (so a user who opts in
// later can flip the flag on a subsequent sign-in too).
export const VerifyOtpAttribution = z.object({
  signupSource: z.string().max(32).optional(),
  utmSource: z.string().max(64).optional(),
  utmMedium: z.string().max(64).optional(),
  utmCampaign: z.string().max(128).optional(),
  referralCode: z.string().max(64).optional(),
  marketingSmsConsent: z.boolean().optional(),
  dpdpConsent: z.boolean().optional(),
  tosVersion: z.string().max(16).optional(),
});
export type VerifyOtpAttribution = z.infer<typeof VerifyOtpAttribution>;

export const PhoneVerifyOtpBody = z.object({
  countryCode: z.string().min(2).max(5),
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(10),
  attribution: VerifyOtpAttribution.optional(),
});
export type PhoneVerifyOtpBody = z.infer<typeof PhoneVerifyOtpBody>;

// PATCH /auth/profile-info — captures first name (required on first sign-in
// modal), optional last name + email. Each field is independently optional
// so the same endpoint can later back partial-edit forms in /account.
export const UpdateProfileInfoBody = z.object({
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().min(1).max(64).optional(),
  email: z.string().trim().email().max(254).optional(),
});
export type UpdateProfileInfoBody = z.infer<typeof UpdateProfileInfoBody>;

export const UpdateProfileInfoResponse = z.object({
  ok: z.boolean(),
  user: AuthUser,
});
export type UpdateProfileInfoResponse = z.infer<
  typeof UpdateProfileInfoResponse
>;

export const PhoneVerifyOtpResponse = z.object({
  ok: z.boolean(),
  user: AuthUser.nullable(),
});
export type PhoneVerifyOtpResponse = z.infer<typeof PhoneVerifyOtpResponse>;

export const LogoutResponse = z.object({
  success: z.boolean(),
});
export type LogoutResponse = z.infer<typeof LogoutResponse>;
