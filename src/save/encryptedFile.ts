import { MAX_SAVE_TEXT_LENGTH, SaveError, type SavedCpuMatch, validateSavedMatch } from './match';

export const SAVE_EXTENSION = '.mcsave';
export const KDF_ITERATIONS = 600_000;
export const MAX_ENCRYPTED_FILE_LENGTH = 12 * 1024 * 1024;
const FILE_FORMAT = 'military-chess-encrypted-save';
const FILE_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export class EncryptedFileError extends Error {
  constructor(public readonly code: 'INVALID_FILE' | 'UNSUPPORTED_FILE_FORMAT' | 'DECRYPT_FAILED' | 'PASSWORD_TOO_SHORT' | SaveError['code']) {
    super(code);
    this.name = 'EncryptedFileError';
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}
function decodeBase64(value: unknown, expectedLength?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new EncryptedFileError('INVALID_FILE');
  try {
    const binary = atob(value);
    if (expectedLength !== undefined && binary.length !== expectedLength) throw new EncryptedFileError('INVALID_FILE');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch { throw new EncryptedFileError('INVALID_FILE'); }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function metadata(salt: string, iv: string) {
  return {
    fileFormat: FILE_FORMAT,
    fileVersion: FILE_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt },
    cipher: { name: 'AES-GCM', iv },
  };
}
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Only non-secret algorithm parameters and ciphertext are visible before decryption. */
export async function encryptMatch(match: SavedCpuMatch, password: string): Promise<string> {
  if (password.length < 8) throw new EncryptedFileError('PASSWORD_TOO_SHORT');
  validateSavedMatch(match);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = metadata(encodeBase64(salt), encodeBase64(iv));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(match));
  if (plaintext.byteLength > MAX_SAVE_TEXT_LENGTH) throw new EncryptedFileError('INVALID_SAVE');
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(header)), tagLength: 128 },
    key,
    plaintext,
  ));
  return JSON.stringify({ ...header, ciphertext: encodeBase64(ciphertext) });
}

export async function decryptMatch(text: string, password: string): Promise<SavedCpuMatch> {
  if (text.length > MAX_ENCRYPTED_FILE_LENGTH || text.length === 0) throw new EncryptedFileError('INVALID_FILE');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new EncryptedFileError('INVALID_FILE'); }
  if (!record(parsed)) throw new EncryptedFileError('INVALID_FILE');
  if (parsed.fileVersion !== FILE_VERSION || parsed.fileFormat !== FILE_FORMAT) throw new EncryptedFileError('UNSUPPORTED_FILE_FORMAT');
  if (!record(parsed.kdf) || !record(parsed.cipher) || Object.keys(parsed).sort().join(',') !== 'cipher,ciphertext,fileFormat,fileVersion,kdf') throw new EncryptedFileError('INVALID_FILE');
  if (Object.keys(parsed.kdf).sort().join(',') !== 'hash,iterations,name,salt' || Object.keys(parsed.cipher).sort().join(',') !== 'iv,name') throw new EncryptedFileError('INVALID_FILE');
  if (parsed.kdf.name !== 'PBKDF2' || parsed.kdf.hash !== 'SHA-256' || parsed.kdf.iterations !== KDF_ITERATIONS || parsed.cipher.name !== 'AES-GCM') throw new EncryptedFileError('UNSUPPORTED_FILE_FORMAT');
  const salt = decodeBase64(parsed.kdf.salt, 16);
  const iv = decodeBase64(parsed.cipher.iv, 12);
  const ciphertext = decodeBase64(parsed.ciphertext);
  if (ciphertext.length < 17) throw new EncryptedFileError('INVALID_FILE');
  const header = metadata(parsed.kdf.salt as string, parsed.cipher.iv as string);
  let plaintext: ArrayBuffer;
  try {
    const key = await deriveKey(password, salt);
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(header)), tagLength: 128 },
      key,
      ciphertext,
    );
  } catch { throw new EncryptedFileError('DECRYPT_FAILED'); }
  try {
    if (plaintext.byteLength > MAX_SAVE_TEXT_LENGTH) throw new EncryptedFileError('INVALID_SAVE');
    return validateSavedMatch(JSON.parse(decoder.decode(plaintext)));
  } catch (error) {
    if (error instanceof EncryptedFileError) throw error;
    if (error instanceof SaveError) throw new EncryptedFileError(error.code);
    throw new EncryptedFileError('INVALID_SAVE');
  }
}

export function saveFileName(match: SavedCpuMatch): string {
  const date = new Date(match.savedAt).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), byte => byte.toString(16).padStart(2, '0')).join('');
  return `military-chess-${date}-${suffix}${SAVE_EXTENSION}`;
}
