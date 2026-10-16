import type { DatabaseState } from './types.ts';

const MAGIC_HEADER = 'FINGUARD_ENC_V1';
const DEFAULT_SALT = new Uint8Array([114, 23, 99, 44, 18, 92, 107, 241, 88, 12, 45, 90, 33, 71, 15, 62]);

/**
 * Derives an AES-GCM 256-bit key using PBKDF2
 */
async function deriveEncryptionKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts the SQLite/DatabaseState payload into an AES-GCM binary blob
 */
export async function encryptDatabasePayload(
  state: DatabaseState,
  passphrase: string = 'FinGuard-Device-Secure-Key-2026'
): Promise<Uint8Array> {
  const jsonStr = JSON.stringify(state);
  const enc = new TextEncoder();
  const dataBytes = enc.encode(jsonStr);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    dataBytes as unknown as BufferSource
  );

  const headerBytes = enc.encode(MAGIC_HEADER);
  const cipherBytes = new Uint8Array(ciphertext);

  // Layout: [MagicHeader (15 bytes)] + [SaltLen (1 byte)] + [Salt (16 bytes)] + [IvLen (1 byte)] + [Iv (12 bytes)] + [Ciphertext]
  const totalLength = headerBytes.length + 1 + salt.length + 1 + iv.length + cipherBytes.length;
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  combined.set(headerBytes, offset);
  offset += headerBytes.length;

  combined[offset] = salt.length;
  offset += 1;
  combined.set(salt, offset);
  offset += salt.length;

  combined[offset] = iv.length;
  offset += 1;
  combined.set(iv, offset);
  offset += iv.length;

  combined.set(cipherBytes, offset);

  return combined;
}

/**
 * Decrypts an AES-GCM binary blob back into DatabaseState with validation
 */
export async function decryptDatabasePayload(
  encryptedBytes: Uint8Array,
  passphrase: string = 'FinGuard-Device-Secure-Key-2026'
): Promise<DatabaseState> {
  const enc = new TextEncoder();
  const headerBytes = enc.encode(MAGIC_HEADER);

  // Validate magic header
  for (let i = 0; i < headerBytes.length; i++) {
    if (encryptedBytes[i] !== headerBytes[i]) {
      throw new Error('Nieprawidłowy nagłówek pliku kopii zapasowej FinGuard');
    }
  }

  let offset = headerBytes.length;
  const saltLen = encryptedBytes[offset];
  offset += 1;
  const salt = encryptedBytes.slice(offset, offset + saltLen);
  offset += saltLen;

  const ivLen = encryptedBytes[offset];
  offset += 1;
  const iv = encryptedBytes.slice(offset, offset + ivLen);
  offset += ivLen;

  const ciphertext = encryptedBytes.slice(offset);

  const key = await deriveEncryptionKey(passphrase, salt as unknown as Uint8Array);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      ciphertext as unknown as BufferSource
    );

    const dec = new TextDecoder();
    const jsonStr = dec.decode(decryptedBuffer);
    const parsed = JSON.parse(jsonStr) as DatabaseState;

    if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
      throw new Error('Kopia zapasowa zawiera uszkodzoną strukturę danych');
    }

    return parsed;
  } catch (err: any) {
    throw new Error('Błąd deszyfrowania bazy danych: niepoprawny klucz lub uszkodzony plik kopii zapasowej');
  }
}
