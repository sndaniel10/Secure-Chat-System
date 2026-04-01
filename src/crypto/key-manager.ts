"use client";

/**
 * Key Manager - Handles identity key lifecycle
 *
 * Generates keys on registration, uploads public bundle to server,
 * and fetches recipient bundles for X3DH handshake.
 */

import { generateIdentityKeys, KeyBundle } from "./x3dh";
import { getIdentityKey } from "./store";

/**
 * Generate and upload keys during registration.
 * Returns true if successful.
 */
export async function initializeKeys(): Promise<boolean> {
  try {
    // Generate all key material locally
    const bundle = await generateIdentityKeys();

    // Upload public key bundle to server
    const res = await fetch("/api/keys/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityKeyPublic: bundle.identityPublic,
        signedPreKeyPublic: bundle.signedPreKeyPublic,
        signedPreKeySig: bundle.signedPreKeySig,
        signedPreKeyId: bundle.signedPreKeyId,
        oneTimePreKeys: bundle.oneTimePreKeys,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("[KeyManager] Failed to initialize keys:", error);
    return false;
  }
}

/**
 * Check if local identity keys exist.
 */
export async function hasLocalKeys(): Promise<boolean> {
  try {
    const identity = await getIdentityKey();
    return !!identity;
  } catch {
    return false;
  }
}

/**
 * Fetch a recipient's key bundle from the server.
 */
export async function fetchKeyBundle(
  userId: string
): Promise<KeyBundle | null> {
  try {
    const res = await fetch(`/api/keys/bundle?userId=${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.bundle;
  } catch {
    return null;
  }
}
