/* ─────────────────────────────────────────────
   crypto.js  —  Fernet-compatible E2E crypto
   + ECDH key exchange
   + ECDSA message signing / verification
   + Forward Secrecy (derive fresh Fernet key per session)
───────────────────────────────────────────── */

// ── helpers ──────────────────────────────────

function base64Encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64Decode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64EncodeUrl(buf) {
  return base64Encode(buf)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ── Fernet (manual) ──────────────────────────

export function generateFernetKey() {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return base64Encode(key);
}

export async function encryptMessage(text, keyBase64) {
  const keyBytes = base64Decode(keyBase64);
  const signingKey = keyBytes.slice(0, 16);
  const encKey = keyBytes.slice(16, 32);

  const iv = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = Math.floor(Date.now() / 1000);
  const tsBytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    tsBytes[i] = timestamp & 0xff;
    timestamp >>= 8;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    encKey,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    aesKey,
    data,
  );
  const ciphertext = new Uint8Array(encrypted);

  const versionTsIvCt = new Uint8Array(1 + 8 + 16 + ciphertext.length);
  versionTsIvCt[0] = 0x80;
  versionTsIvCt.set(tsBytes, 1);
  versionTsIvCt.set(iv, 9);
  versionTsIvCt.set(ciphertext, 25);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    signingKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hmacSig = await crypto.subtle.sign("HMAC", hmacKey, versionTsIvCt);
  const hmacBytes = new Uint8Array(hmacSig);

  const token = new Uint8Array(1 + 8 + 16 + ciphertext.length + 32);
  token.set(versionTsIvCt);
  token.set(hmacBytes, versionTsIvCt.length);

  return base64Encode(token);
}

export async function decryptMessage(tokenBase64, keyBase64) {
  try {
    const token = base64Decode(tokenBase64);
    if (token[0] !== 0x80) return null;

    const keyBytes = base64Decode(keyBase64);
    const signingKey = keyBytes.slice(0, 16);
    const encKey = keyBytes.slice(16, 32);

    const iv = token.slice(9, 25);
    const ciphertext = token.slice(25, -32);
    const hmacSig = token.slice(-32);
    const toVerify = token.slice(0, -32);

    const hmacKey = await crypto.subtle.importKey(
      "raw",
      signingKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      hmacKey,
      hmacSig,
      toVerify,
    );
    if (!valid) return null;

    const aesKey = await crypto.subtle.importKey(
      "raw",
      encKey,
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      aesKey,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// ── ECDH ─────────────────────────────────────
// Generates an ephemeral P-256 key pair for this session.
// After exchanging public keys with the peer, call deriveSharedFernetKey()
// to get a fresh Fernet key neither party manually chose.

export async function generateECDHKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const pubRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const pubB64 = base64EncodeUrl(pubRaw);
  return { keyPair: pair, publicKeyB64: pubB64 };
}

export async function deriveSharedFernetKey(myKeyPair, peerPublicKeyB64) {
  const peerRaw = base64Decode(peerPublicKeyB64);
  const peerKey = await crypto.subtle.importKey(
    "raw",
    peerRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    myKeyPair.privateKey,
    256,
  );
  // Use first 32 bytes as Fernet key material (HKDF-like simplification for demo)
  return base64Encode(sharedBits);
}

// ── ECDSA ─────────────────────────────────────
// Signs each message payload so the receiver can verify authenticity.

export async function generateECDSAKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pubRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const pubB64 = base64EncodeUrl(pubRaw);
  return { keyPair: pair, publicKeyB64: pubB64 };
}

export async function signMessage(text, ecdsaPrivateKey) {
  const data = new TextEncoder().encode(text);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    ecdsaPrivateKey,
    data,
  );
  return base64EncodeUrl(sig);
}

export async function verifyMessage(text, signatureB64, peerEcdsaPublicKeyB64) {
  try {
    const peerRaw = base64Decode(peerEcdsaPublicKeyB64);
    const peerKey = await crypto.subtle.importKey(
      "raw",
      peerRaw,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const sig = base64Decode(signatureB64);
    const data = new TextEncoder().encode(text);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      peerKey,
      sig,
      data,
    );
  } catch {
    return false;
  }
}
