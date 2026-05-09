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

export const PhoneVerifyOtpBody = z.object({
  countryCode: z.string().min(2).max(5),
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(10),
});
export type PhoneVerifyOtpBody = z.infer<typeof PhoneVerifyOtpBody>;

export const PhoneVerifyOtpResponse = z.object({
  ok: z.boolean(),
  user: AuthUser.nullable(),
});
export type PhoneVerifyOtpResponse = z.infer<typeof PhoneVerifyOtpResponse>;

export const LogoutResponse = z.object({
  success: z.boolean(),
});
export type LogoutResponse = z.infer<typeof LogoutResponse>;
