import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../lib/projectRoot.js';

let documentKey = null;

function getDocumentKey() {
  if (documentKey) return documentKey;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set; cannot encrypt consumer documents');
  documentKey = crypto.scryptSync(secret, 'medicosts-consumer-documents', 32);
  return documentKey;
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function encryptDocumentBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getDocumentKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('MCDOC1'), iv, tag, encrypted]);
}

export function decryptDocumentBuffer(buffer) {
  const magic = buffer.subarray(0, 6).toString('utf8');
  if (magic !== 'MCDOC1') throw new Error('Invalid encrypted document format');
  const iv = buffer.subarray(6, 18);
  const tag = buffer.subarray(18, 34);
  const encrypted = buffer.subarray(34);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getDocumentKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function writeEncryptedConsumerDocument({
  userId,
  caseId,
  documentId = crypto.randomUUID(),
  buffer,
}) {
  const encrypted = encryptDocumentBuffer(buffer);
  const relativeKey = path.posix.join(
    'consumer-documents',
    String(userId),
    String(caseId),
    `${documentId}.enc`,
  );
  const absolutePath = path.join(projectRoot(), 'storage', ...relativeKey.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await writeFile(absolutePath, encrypted, { mode: 0o600 });
  return { documentId, storageKey: relativeKey, absolutePath };
}

export async function readEncryptedConsumerDocument(storageKey) {
  if (!storageKey || storageKey.includes('..')) {
    throw new Error('Invalid consumer document storage key');
  }
  const absolutePath = path.join(projectRoot(), 'storage', ...storageKey.split('/'));
  const encrypted = await readFile(absolutePath);
  return decryptDocumentBuffer(encrypted);
}

export async function deleteStoredDocumentByKey(storageKey) {
  if (!storageKey || storageKey.includes('..')) return;
  const absolutePath = path.join(projectRoot(), 'storage', ...storageKey.split('/'));
  await unlink(absolutePath).catch(() => {});
}
