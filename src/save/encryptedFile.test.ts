// @vitest-environment node
import { expect, test } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { startGame } from '../game/game';
import { createSavedMatch } from './match';
import { decryptMatch, encryptMatch, saveFileName } from './encryptedFile';

const match = () => createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), 1), 'easy', 9750);
const testPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => (byte % 10).toString()).join('');

test('password-encrypted file round trips full match without plaintext password or piece secrets', async () => {
  const original = match();
  const password = testPassword();
  const text = await encryptMatch(original, password);
  const visible = JSON.parse(text);
  expect(Object.keys(visible).sort()).toEqual(['cipher', 'ciphertext', 'fileFormat', 'fileVersion', 'kdf']);
  expect(text).not.toContain(password);
  expect(text).not.toContain('general');
  expect(text).not.toContain('initialPlacements');
  expect(visible.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 });
  expect(visible.cipher.name).toBe('AES-GCM');
  expect(await decryptMatch(text, password)).toEqual(original);
});

test('fresh salt and IV make repeated exports of one match different', async () => {
  const original = match();
  const password = testPassword();
  const first = await encryptMatch(original, password);
  const second = await encryptMatch(original, password);
  expect(first).not.toBe(second);
  expect(JSON.parse(first).kdf.salt).not.toBe(JSON.parse(second).kdf.salt);
  expect(JSON.parse(first).cipher.iv).not.toBe(JSON.parse(second).cipher.iv);
});

test('wrong password, changed ciphertext, and changed authenticated metadata all fail', async () => {
  const password = testPassword();
  const text = await encryptMatch(match(), password);
  await expect(decryptMatch(text, password + '0')).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  const changed = JSON.parse(text);
  const data = changed.ciphertext as string;
  changed.ciphertext = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
  await expect(decryptMatch(JSON.stringify(changed), password)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  const header = JSON.parse(text);
  const salt = header.kdf.salt as string;
  header.kdf.salt = (salt[0] === 'A' ? 'B' : 'A') + salt.slice(1);
  await expect(decryptMatch(JSON.stringify(header), password)).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
});

test('invalid file, unsupported format, and short export password are rejected', async () => {
  const password = testPassword();
  await expect(decryptMatch('{', password)).rejects.toMatchObject({ code: 'INVALID_FILE' });
  const text = await encryptMatch(match(), password);
  const unsupported = JSON.parse(text); unsupported.fileVersion = 99;
  await expect(decryptMatch(JSON.stringify(unsupported), password)).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_FORMAT' });
  await expect(encryptMatch(match(), password.slice(0, 0))).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
  await expect(encryptMatch(match(), password.slice(0, 3))).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
});

test('file names have timestamp, random suffix, and .mcsave extension', () => {
  const original = match();
  const first = saveFileName(original); const second = saveFileName(original);
  expect(first).toMatch(/^military-chess-\d{8}-\d{6}-[0-9a-f]{6}\.mcsave$/);
  expect(first).not.toBe(second);
});
