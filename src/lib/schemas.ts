import { z } from "zod";

export const userCreateSchema = z.object({
  username: z.string().min(3).max(20),
  displayName: z.string(),
  password: z.string().min(8),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const conversationCreateSchema = z.object({
  recipientId: z.string().min(1),
});
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;

export const oneTimePreKeySchema = z.object({
  keyId: z.number().int(),
  publicKey: z.string(),
});

export const keyBundleUploadSchema = z.object({
  identityKeyPublic: z.string(),
  signedPreKeyPublic: z.string(),
  signedPreKeySig: z.string(),
  signedPreKeyId: z.number().int(),
  oneTimePreKeys: z.array(oneTimePreKeySchema).default([]),
});
export type KeyBundleUploadInput = z.infer<typeof keyBundleUploadSchema>;

export const hpoToggleSchema = z.object({
  enabled: z.boolean(),
});
export type HpoToggleInput = z.infer<typeof hpoToggleSchema>;
