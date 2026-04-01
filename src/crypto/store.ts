"use client";

import { openDB, IDBPDatabase } from "idb";

const DB_NAME_PREFIX = "hpo-chat-crypto";
const DB_VERSION = 2;

interface CryptoStore {
  identity: {
    key: string;
    value: {
      publicKey: string; // hex encoded
      privateKey: string; // hex encoded
    };
  };
  sessions: {
    key: string; // conversationId
    value: {
      conversationId: string;
      rootKey: string; // hex
      sendChainKey: string; // hex
      recvChainKey: string; // hex
      sendRatchetPrivate: string; // hex
      sendRatchetPublic: string; // hex
      recvRatchetPublic: string; // hex
      sendMessageNumber: number;
      recvMessageNumber: number;
    };
  };
  prekeys: {
    key: number;
    value: {
      keyId: number;
      publicKey: string; // hex
      privateKey: string; // hex
      used: boolean;
    };
  };
  decryptedMessages: {
    key: string; // messageId
    value: {
      messageId: string;
      plaintext: string;
    };
  };
}

let currentUserId: string | null = null;
let dbPromise: Promise<IDBPDatabase<CryptoStore>> | null = null;

/**
 * Initialize the crypto store for a specific user.
 * Must be called before any other store operations.
 * Each user gets their own IndexedDB database to prevent key collisions
 * when multiple users share the same browser/origin.
 */
export function initCryptoStore(userId: string) {
  if (currentUserId !== userId) {
    currentUserId = userId;
    dbPromise = null; // Force re-open with new DB name
  }
}

function getDB() {
  if (!dbPromise) {
    const dbName = currentUserId
      ? `${DB_NAME_PREFIX}-${currentUserId}`
      : DB_NAME_PREFIX;
    dbPromise = openDB<CryptoStore>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("identity")) {
          db.createObjectStore("identity");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions");
        }
        if (!db.objectStoreNames.contains("prekeys")) {
          db.createObjectStore("prekeys");
        }
        if (!db.objectStoreNames.contains("decryptedMessages")) {
          db.createObjectStore("decryptedMessages");
        }
      },
    });
  }
  return dbPromise;
}

// Identity key operations
export async function getIdentityKey() {
  const db = await getDB();
  return db.get("identity", "main");
}

export async function setIdentityKey(keys: {
  publicKey: string;
  privateKey: string;
}) {
  const db = await getDB();
  await db.put("identity", keys, "main");
}

// Signed pre-key operations
export async function getSignedPreKey() {
  const db = await getDB();
  return db.get("identity", "signedPreKey");
}

export async function setSignedPreKey(keys: {
  publicKey: string;
  privateKey: string;
}) {
  const db = await getDB();
  await db.put("identity", keys, "signedPreKey");
}

// Session operations
export async function getSession(conversationId: string) {
  const db = await getDB();
  return db.get("sessions", conversationId);
}

export async function setSession(
  conversationId: string,
  session: CryptoStore["sessions"]["value"]
) {
  const db = await getDB();
  await db.put("sessions", session, conversationId);
}

export async function deleteSession(conversationId: string) {
  const db = await getDB();
  await db.delete("sessions", conversationId);
}

// Pre-key operations
export async function getPreKey(keyId: number) {
  const db = await getDB();
  return db.get("prekeys", keyId);
}

export async function setPreKey(prekey: CryptoStore["prekeys"]["value"]) {
  const db = await getDB();
  await db.put("prekeys", prekey, prekey.keyId);
}

export async function markPreKeyUsed(keyId: number) {
  const db = await getDB();
  const key = await db.get("prekeys", keyId);
  if (key) {
    key.used = true;
    await db.put("prekeys", key, keyId);
  }
}

// Decrypted message cache operations
export async function getCachedPlaintext(messageId: string): Promise<string | undefined> {
  const db = await getDB();
  const entry = await db.get("decryptedMessages", messageId);
  return entry?.plaintext;
}

export async function setCachedPlaintext(messageId: string, plaintext: string) {
  const db = await getDB();
  await db.put("decryptedMessages", { messageId, plaintext }, messageId);
}
