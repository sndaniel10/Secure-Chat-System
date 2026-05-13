"use client";

export interface KeyVault {
  identityKey: { publicKey: string; privateKey: string };
  signedPreKey: { publicKey: string; privateKey: string };
  preKeys: Array<{ keyId: number; publicKey: string; privateKey: string; used: boolean }>;
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBuffer(bytes: number): ArrayBuffer {
  const buf = new ArrayBuffer(bytes);
  crypto.getRandomValues(new Uint8Array(buf));
  return buf;
}

export async function encryptVault(vault: KeyVault, password: string): Promise<string> {
  const salt = randomBuffer(16);
  const iv = randomBuffer(12);
  const key = await deriveKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  const out = new Uint8Array(16 + 12 + ciphertext.byteLength);
  out.set(new Uint8Array(salt), 0);
  out.set(new Uint8Array(iv), 16);
  out.set(new Uint8Array(ciphertext), 28);
  return btoa(String.fromCharCode(...out));
}

export async function decryptVault(blob: string, password: string): Promise<KeyVault> {
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const salt = raw.slice(0, 16).buffer as ArrayBuffer;
  const iv = raw.slice(16, 28).buffer as ArrayBuffer;
  const ciphertext = raw.slice(28).buffer as ArrayBuffer;
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as KeyVault;
}
