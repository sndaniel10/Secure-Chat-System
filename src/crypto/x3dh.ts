"use client";

/**
 * X3DH (Extended Triple Diffie-Hellman) Key Agreement Protocol
 *
 * Implements the Signal Protocol's X3DH handshake for establishing
 * shared secrets between two parties. Uses X25519 for key exchange.
 *
 * References:
 * - Signal Protocol Specification: https://signal.org/docs/specifications/x3dh/
 */

import { dh, kdf, concat, toHex, fromHex, generateKeyPair } from "./utils";
import {
  getIdentityKey,
  setIdentityKey,
  getSignedPreKey,
  setSignedPreKey,
} from "./store";

export interface KeyBundle {
  identityKey: string; // hex public key
  signedPreKey: string; // hex public key
  signedPreKeySig: string; // hex signature
  signedPreKeyId: number;
  oneTimePreKey?: string; // hex public key (optional)
  oneTimePreKeyId?: number;
}

export interface X3DHResult {
  sharedSecret: Uint8Array; // 32-byte shared secret
  ephemeralPublic: string; // hex public key sent to recipient
  usedOneTimePreKeyId?: number;
}

/**
 * Generate identity keys and store them locally.
 * Called once during registration.
 */
export async function generateIdentityKeys(): Promise<{
  identityPublic: string;
  signedPreKeyPublic: string;
  signedPreKeySig: string;
  signedPreKeyId: number;
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>;
}> {
  // Generate long-term identity key pair
  const identityKP = generateKeyPair();
  await setIdentityKey({
    publicKey: toHex(identityKP.publicKey),
    privateKey: toHex(identityKP.privateKey),
  });

  // Generate signed pre-key
  const signedPreKP = generateKeyPair();
  await setSignedPreKey({
    publicKey: toHex(signedPreKP.publicKey),
    privateKey: toHex(signedPreKP.privateKey),
  });

  // Sign the signed pre-key with the identity key (simplified: HMAC-based)
  const { hmacSha256 } = await import("./utils");
  const sig = hmacSha256(identityKP.privateKey, signedPreKP.publicKey);

  // Generate one-time pre-keys
  const { setPreKey } = await import("./store");
  const oneTimePreKeys: Array<{ keyId: number; publicKey: string }> = [];
  for (let i = 0; i < 20; i++) {
    const preKP = generateKeyPair();
    await setPreKey({
      keyId: i,
      publicKey: toHex(preKP.publicKey),
      privateKey: toHex(preKP.privateKey),
      used: false,
    });
    oneTimePreKeys.push({ keyId: i, publicKey: toHex(preKP.publicKey) });
  }

  return {
    identityPublic: toHex(identityKP.publicKey),
    signedPreKeyPublic: toHex(signedPreKP.publicKey),
    signedPreKeySig: toHex(sig),
    signedPreKeyId: 0,
    oneTimePreKeys,
  };
}

/**
 * Perform X3DH as the initiator (Alice).
 * Alice wants to establish a session with Bob using Bob's key bundle.
 */
export async function x3dhInitiate(
  recipientBundle: KeyBundle
): Promise<X3DHResult> {
  const identity = await getIdentityKey();
  if (!identity) throw new Error("No identity key found");

  const IKa = fromHex(identity.privateKey); // Alice's identity private key
  const IKb = fromHex(recipientBundle.identityKey); // Bob's identity public key
  const SPKb = fromHex(recipientBundle.signedPreKey); // Bob's signed pre-key

  // Generate ephemeral key pair
  const ephemeral = generateKeyPair();
  const EKa = ephemeral.privateKey;

  // X3DH: Four DH operations
  // DH1 = DH(IKa, SPKb)  - Alice's identity key + Bob's signed pre-key
  // DH2 = DH(EKa, IKb)   - Alice's ephemeral key + Bob's identity key
  // DH3 = DH(EKa, SPKb)  - Alice's ephemeral key + Bob's signed pre-key
  const dh1 = dh(IKa, SPKb);
  const dh2 = dh(EKa, IKb);
  const dh3 = dh(EKa, SPKb);

  let dhConcat = concat(dh1, dh2, dh3);

  // Optional: DH4 with one-time pre-key
  let usedOneTimePreKeyId: number | undefined;
  if (recipientBundle.oneTimePreKey) {
    const OPKb = fromHex(recipientBundle.oneTimePreKey);
    const dh4 = dh(EKa, OPKb);
    dhConcat = concat(dhConcat, dh4);
    usedOneTimePreKeyId = recipientBundle.oneTimePreKeyId;
  }

  // Derive shared secret using HKDF
  const sharedSecret = kdf(dhConcat, null, "X3DH-SharedSecret", 32);

  return {
    sharedSecret,
    ephemeralPublic: toHex(ephemeral.publicKey),
    usedOneTimePreKeyId,
  };
}

/**
 * Perform X3DH as the responder (Bob).
 * Bob receives Alice's initial message containing her identity key
 * and ephemeral key, and derives the same shared secret.
 */
export async function x3dhRespond(
  senderIdentityKey: string, // hex
  senderEphemeralKey: string, // hex
  usedOneTimePreKeyId?: number
): Promise<Uint8Array> {
  const identity = await getIdentityKey();
  const signedPreKey = await getSignedPreKey();
  if (!identity || !signedPreKey) {
    throw new Error("Missing keys for X3DH response");
  }

  const IKb = fromHex(identity.privateKey); // Bob's identity private key
  const SPKb = fromHex(signedPreKey.privateKey); // Bob's signed pre-key private
  const IKa = fromHex(senderIdentityKey); // Alice's identity public key
  const EKa = fromHex(senderEphemeralKey); // Alice's ephemeral public key

  // Mirror the DH operations
  const dh1 = dh(SPKb, IKa); // DH(SPKb, IKa)
  const dh2 = dh(IKb, EKa); // DH(IKb, EKa)
  const dh3 = dh(SPKb, EKa); // DH(SPKb, EKa)

  let dhConcat = concat(dh1, dh2, dh3);

  // Optional: DH4 with one-time pre-key
  if (usedOneTimePreKeyId !== undefined) {
    const { getPreKey, markPreKeyUsed } = await import("./store");
    const oneTimePreKey = await getPreKey(usedOneTimePreKeyId);
    if (oneTimePreKey) {
      const OPKb = fromHex(oneTimePreKey.privateKey);
      const dh4 = dh(OPKb, EKa);
      dhConcat = concat(dhConcat, dh4);
      await markPreKeyUsed(usedOneTimePreKeyId);
    }
  }

  // Derive shared secret using HKDF (same as initiator)
  return kdf(dhConcat, null, "X3DH-SharedSecret", 32);
}
