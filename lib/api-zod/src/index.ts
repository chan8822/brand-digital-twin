export * from "./generated/api";
export * from "./generated/types";

import { z } from "zod";

export const AuthUser = z.object({
  id: z.string(),
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

export const ExchangeMobileAuthorizationCodeBody = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  nonce: z.string().nullable().optional(),
});
export type ExchangeMobileAuthorizationCodeBody = z.infer<
  typeof ExchangeMobileAuthorizationCodeBody
>;

export const ExchangeMobileAuthorizationCodeResponse = z.object({
  token: z.string(),
});
export type ExchangeMobileAuthorizationCodeResponse = z.infer<
  typeof ExchangeMobileAuthorizationCodeResponse
>;

export const LogoutMobileSessionResponse = z.object({
  success: z.boolean(),
});
export type LogoutMobileSessionResponse = z.infer<
  typeof LogoutMobileSessionResponse
>;
