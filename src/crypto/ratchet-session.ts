"use client";

/**
 * Double Ratchet Algorithm Implementation
 *
 * Provides forward secrecy and break-in recovery for message encryption.
 * Each message uses a unique key derived from a ratcheting chain.
 *
 * Simplified implementation based on:
 * - Signal Double Ratchet Specification
 * - Uses HKDF for key derivation and AES-256-GCM for encryption
 */

import {
  generateKeyPair,
  dh,
  kdf,
  hmacSha256,
  aesEncrypt,
  aesDecrypt,
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  concat,
} from "./utils";
import { getSession, setSession } from "./store";

interface RatchetState {
  rootKey: Uint8Array;
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
  sendRatchetKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
  recvRatchetPublic: Uint8Array;
  sendMessageNumber: number;
  recvMessageNumber: number;
}

export interface EncryptedMessage {
  header: {
    ratchetPublic: string; // hex - sender's current ratchet public key
    messageNumber: number;
    previousChainLength: number;
    // X3DH initial message fields (only in first message)
    identityKey?: string; // hex
    ephemeralKey?: string; // hex
    usedOneTimePreKeyId?: number;
  };
  ciphertext: string; // base64
  iv: string; // base64
}

/**
 * Initialize a ratchet session as the initiator (after X3DH).
 */
export async function initSenderSession(
  conversationId: string,
  sharedSecret: Uint8Array,
  recipientRatchetPublic: Uint8Array
): Promise<void> {
  // Generate first ratchet key pair
  const ratchetKP = generateKeyPair();

  // Perform DH with recipient's ratchet public key (signed pre-key)
  const dhOutput = dh(ratchetKP.privateKey, recipientRatchetPublic);

  // Derive root key and send chain key
  // Info string must match ratchetDecrypt's "DoubleRatchet-Recv" so receiver derives same keys
  const derived = kdf(
    concat(sharedSecret, dhOutput),
    null,
    "DoubleRatchet-Recv",
    64
  );
  const rootKey = derived.slice(0, 32);
  const sendChainKey = derived.slice(32, 64);

  const state: RatchetState = {
    rootKey,
    sendChainKey,
    recvChainKey: new Uint8Array(32), // Will be set on first received message
    sendRatchetKeyPair: ratchetKP,
    recvRatchetPublic: recipientRatchetPublic,
    sendMessageNumber: 0,
    recvMessageNumber: 0,
  };

  await saveState(conversationId, state);
}

/**
 * Initialize a ratchet session as the responder (after X3DH).
 */
export async function initReceiverSession(
  conversationId: string,
  sharedSecret: Uint8Array,
  ownRatchetKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array }
): Promise<void> {
  const state: RatchetState = {
    rootKey: sharedSecret,
    sendChainKey: new Uint8Array(32),
    recvChainKey: new Uint8Array(32),
    sendRatchetKeyPair: ownRatchetKeyPair,
    recvRatchetPublic: new Uint8Array(32), // Will be set on first DH ratchet step
    sendMessageNumber: 0,
    recvMessageNumber: 0,
  };

  await saveState(conversationId, state);
}

/**
 * Encrypt a message using the Double Ratchet.
 */
export async function ratchetEncrypt(
  conversationId: string,
  plaintext: string
): Promise<EncryptedMessage> {
  const state = await loadState(conversationId);
  if (!state) throw new Error("No ratchet session found");

  // Derive message key from send chain key
  const messageKey = hmacSha256(
    state.sendChainKey,
    new Uint8Array([0x01])
  );

  // Advance send chain key
  state.sendChainKey = hmacSha256(
    state.sendChainKey,
    new Uint8Array([0x02])
  );

  // Encrypt the message with AES-256-GCM
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const { ciphertext, iv } = await aesEncrypt(
    messageKey.slice(0, 32),
    plaintextBytes
  );

  const message: EncryptedMessage = {
    header: {
      ratchetPublic: toHex(state.sendRatchetKeyPair.publicKey),
      messageNumber: state.sendMessageNumber,
      previousChainLength: 0,
    },
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
  };

  state.sendMessageNumber++;
  await saveState(conversationId, state);

  return message;
}

/**
 * Decrypt a message using the Double Ratchet.
 */
export async function ratchetDecrypt(
  conversationId: string,
  message: EncryptedMessage
): Promise<string> {
  const state = await loadState(conversationId);
  if (!state) throw new Error("No ratchet session found");

  const senderRatchetPublic = fromHex(message.header.ratchetPublic);

  // Check if we need to perform a DH ratchet step
  if (toHex(senderRatchetPublic) !== toHex(state.recvRatchetPublic)) {
    // Perform DH ratchet step
    state.recvRatchetPublic = senderRatchetPublic;

    // Derive new receive chain key
    const dhOutput = dh(
      state.sendRatchetKeyPair.privateKey,
      senderRatchetPublic
    );
    const derived = kdf(
      concat(state.rootKey, dhOutput),
      null,
      "DoubleRatchet-Recv",
      64
    );
    state.rootKey = derived.slice(0, 32);
    state.recvChainKey = derived.slice(32, 64);
    state.recvMessageNumber = 0;

    // Generate new ratchet key pair for sending
    const newRatchetKP = generateKeyPair();
    const dhOutput2 = dh(newRatchetKP.privateKey, senderRatchetPublic);
    const derived2 = kdf(
      concat(state.rootKey, dhOutput2),
      null,
      "DoubleRatchet-Recv",
      64
    );
    state.rootKey = derived2.slice(0, 32);
    state.sendChainKey = derived2.slice(32, 64);
    state.sendRatchetKeyPair = newRatchetKP;
    state.sendMessageNumber = 0;
  }

  // Derive message key from receive chain key
  const messageKey = hmacSha256(
    state.recvChainKey,
    new Uint8Array([0x01])
  );

  // Advance receive chain key
  state.recvChainKey = hmacSha256(
    state.recvChainKey,
    new Uint8Array([0x02])
  );

  // Decrypt the message
  const ciphertext = fromBase64(message.ciphertext);
  const iv = fromBase64(message.iv);
  const plaintextBytes = await aesDecrypt(
    messageKey.slice(0, 32),
    ciphertext,
    iv
  );

  state.recvMessageNumber++;
  await saveState(conversationId, state);

  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Check if a session exists for a conversation.
 */
export async function hasSession(conversationId: string): Promise<boolean> {
  const session = await getSession(conversationId);
  return !!session;
}

// Internal: Save ratchet state to IndexedDB
async function saveState(
  conversationId: string,
  state: RatchetState
): Promise<void> {
  await setSession(conversationId, {
    conversationId,
    rootKey: toHex(state.rootKey),
    sendChainKey: toHex(state.sendChainKey),
    recvChainKey: toHex(state.recvChainKey),
    sendRatchetPrivate: toHex(state.sendRatchetKeyPair.privateKey),
    sendRatchetPublic: toHex(state.sendRatchetKeyPair.publicKey),
    recvRatchetPublic: toHex(state.recvRatchetPublic),
    sendMessageNumber: state.sendMessageNumber,
    recvMessageNumber: state.recvMessageNumber,
  });
}

// Internal: Load ratchet state from IndexedDB
async function loadState(
  conversationId: string
): Promise<RatchetState | null> {
  const stored = await getSession(conversationId);
  if (!stored) return null;

  return {
    rootKey: fromHex(stored.rootKey),
    sendChainKey: fromHex(stored.sendChainKey),
    recvChainKey: fromHex(stored.recvChainKey),
    sendRatchetKeyPair: {
      privateKey: fromHex(stored.sendRatchetPrivate),
      publicKey: fromHex(stored.sendRatchetPublic),
    },
    recvRatchetPublic: fromHex(stored.recvRatchetPublic),
    sendMessageNumber: stored.sendMessageNumber,
    recvMessageNumber: stored.recvMessageNumber,
  };
}
