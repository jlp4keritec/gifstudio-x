import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

export type StorageFolder = 'videos' | 'gifs' | 'thumbnails' | 'trash';

const STORAGE_ROOT = path.resolve(env.STORAGE_ROOT);

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function initStorage(): Promise<void> {
  const folders: StorageFolder[] = ['videos', 'gifs', 'thumbnails', 'trash'];
  for (const folder of folders) {
    await ensureDir(path.join(STORAGE_ROOT, folder));
  }
  console.info(`📂 Storage ready at ${STORAGE_ROOT}`);
}

export function getFolderPath(folder: StorageFolder): string {
  return path.join(STORAGE_ROOT, folder);
}

export function getFilePath(folder: StorageFolder, filename: string): string {
  return path.join(STORAGE_ROOT, folder, filename);
}

export function getPublicUrl(folder: StorageFolder, filename: string): string {
  return `/storage/${folder}/${filename}`;
}

export function generateFilename(extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${randomUUID()}${ext.toLowerCase()}`;
}

export async function moveToTrash(folder: StorageFolder, filename: string): Promise<string> {
  const source = getFilePath(folder, filename);
  const archivedName = `${Date.now()}-${filename}`;
  const destination = getFilePath('trash', archivedName);
  await fs.rename(source, destination);
  return archivedName;
}

export async function deleteFile(folder: StorageFolder, filename: string): Promise<void> {
  try {
    await fs.unlink(getFilePath(folder, filename));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function fileExists(folder: StorageFolder, filename: string): Promise<boolean> {
  try {
    await fs.access(getFilePath(folder, filename));
    return true;
  } catch {
    return false;
  }
}
