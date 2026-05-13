"use client";

/**
 * Key Manager - Handles identity key lifecycle
 *
 * Generates keys on registration, uploads public bundle to server,
 * and fetches recipient bundles for X3DH handshake.
 */

import { generateIdentityKeys, KeyBundle } from "./x3dh";
import { getIdentityKey, getSignedPreKey, getAllPreKeys, restoreFromKeyVault } from "./store";
import { authFetch } from "@/lib/auth-client";
import { encryptVault, decryptVault } from "./vault";

/**
 * Generate and upload keys during registration, then back them up
 * in an encrypted vault so any origin can restore them after login.
 */
export async function initializeKeys(password: string): Promise<boolean> {
  try {
    const bundle = await generateIdentityKeys();

    // Upload public key bundle to server
    const res = await authFetch("/api/keys/upload", {
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

    if (!res.ok) return false;

    // Upload encrypted private key vault so other origins can restore keys
    await uploadVault(password);

    return true;
  } catch (error) {
    console.error("[KeyManager] Failed to initialize keys:", error);
    return false;
  }
}

async function uploadVault(password: string): Promise<void> {
  const [identityKey, signedPreKey, preKeys] = await Promise.all([
    getIdentityKey(),
    getSignedPreKey(),
    getAllPreKeys(),
  ]);
  if (!identityKey || !signedPreKey) return;

  const encryptedVault = await encryptVault({ identityKey, signedPreKey, preKeys }, password);
  await authFetch("/api/keys/vault", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encryptedVault }),
  });
}

let vaultSynced = false;

/**
 * If the user has local keys but no server vault yet (e.g. registered before
 * vault support was added), upload one silently. Safe to call on every login —
 * it skips the upload if a vault already exists or keys are missing.
 */
export async function ensureVaultSynced(password: string): Promise<void> {
  if (vaultSynced) return;
  vaultSynced = true;
  try {
    const res = await authFetch("/api/keys/vault");
    if (!res.ok) return;
    const { vault } = await res.json();
    if (vault) return; // Already backed up
    await uploadVault(password);
  } catch {
    // Non-critical — don't block anything
  }
}

/**
 * Restore private keys from the server vault on a new origin.
 * Returns true if keys were successfully restored.
 */
export async function restoreFromVault(password: string): Promise<boolean> {
  try {
    const res = await authFetch("/api/keys/vault");
    if (!res.ok) return false;
    const { vault } = await res.json();
    if (!vault) return false;

    const keyVault = await decryptVault(vault, password);
    await restoreFromKeyVault(keyVault);
    return true;
  } catch (error) {
    console.error("[KeyManager] Failed to restore vault:", error);
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
    const res = await authFetch(`/api/keys/bundle?userId=${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.bundle;
  } catch {
    return null;
  }
}
