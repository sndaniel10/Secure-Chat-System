"use client";

import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";

// Hex encoding/decoding utilities
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Base64 encoding/decoding
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Generate X25519 key pair
export function generateKeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

// X25519 Diffie-Hellman
export function dh(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// HKDF key derivation
export function kdf(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array | null,
  info: string,
  length: number = 32
): Uint8Array {
  const ikm = inputKeyMaterial;
  const s = salt || new Uint8Array(32); // If no salt, use zeros
  return hkdf(sha256, ikm, s, new TextEncoder().encode(info), length);
}

// HMAC-SHA256
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

// AES-256-GCM encryption using Web Crypto API
export async function aesEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Copy key to ensure standalone ArrayBuffer (noble-hashes may return views into pooled memory)
  const keyBytes = new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const params: AesGcmParams = {
    name: "AES-GCM",
    iv,
  };
  if (associatedData) {
    params.additionalData = new Uint8Array(associatedData);
  }

  const encrypted = await crypto.subtle.encrypt(
    params,
    cryptoKey,
    new Uint8Array(plaintext)
  );

  return {
    ciphertext: new Uint8Array(encrypted),
    iv,
  };
}

// AES-256-GCM decryption
export async function aesDecrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  associatedData?: Uint8Array
): Promise<Uint8Array> {
  // Copy key to ensure standalone ArrayBuffer (noble-hashes may return views into pooled memory)
  const keyBytes = new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const params: AesGcmParams = {
    name: "AES-GCM",
    iv: new Uint8Array(iv),
  };
  if (associatedData) {
    params.additionalData = new Uint8Array(associatedData);
  }

  const decrypted = await crypto.subtle.decrypt(
    params,
    cryptoKey,
    new Uint8Array(ciphertext)
  );

  return new Uint8Array(decrypted);
}

// Concatenate Uint8Arrays
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
