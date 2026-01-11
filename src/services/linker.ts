/**
 * Linker Service
 * Handles symlinks and copies for project integration
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { addLink, removeLink, getLinks, getLinksForEnvFile as _getLinksForEnvFile } from './config.js';

// Re-export for convenience
export { getLinksForEnvFile } from './config.js';
import { readEnvFile, getEnvFilePath, serializeEnvContent } from './envfile.js';
import { getManifest } from './git.js';
import type { LinkInfo, EncryptionOptions } from '../types/index.js';

const execAsync = promisify(exec);

/**
 * Check if we're on Windows
 */
function isWindows(): boolean {
  return os.platform() === 'win32';
}

/**
 * Create a symlink from source to target
 * On Windows, this may require admin privileges for file symlinks
 */
export async function createSymlink(
  sourceFileId: string,
  targetPath: string,
  encryptionOptions?: EncryptionOptions
): Promise<LinkInfo> {
  const manifest = await getManifest();
  const metadata = manifest.files.find(f => f.id === sourceFileId);
  
  if (!metadata) {
    throw new Error(`Env file not found: ${sourceFileId}`);
  }
  
  const sourcePath = getEnvFilePath(sourceFileId, metadata.encrypted);
  
  if (!(await fs.pathExists(sourcePath))) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  
  // Resolve target path
  const resolvedTarget = path.resolve(targetPath);
  const targetDir = path.dirname(resolvedTarget);
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir);
  
  // Remove existing file/link at target
  if (await fs.pathExists(resolvedTarget)) {
    await fs.remove(resolvedTarget);
  }
  
  // For encrypted files, we need to create a decrypted copy and link to that
  // For unencrypted files, we can link directly
  if (metadata.encrypted) {
    if (!encryptionOptions) {
      throw new Error('Encryption options required for encrypted files');
    }
    
    // Create a decrypted temp file and symlink to it
    // Actually, for encrypted files, symlinks don't work well
    // Better to create a copy that gets synced
    throw new Error('Use "copy" mode for encrypted files. Symlinks cannot decrypt on-the-fly.');
  }
  
  // Create symlink
  if (isWindows()) {
    // Windows requires special handling for symlinks
    try {
      // Try to create symlink (may require Developer Mode or admin)
      await fs.symlink(sourcePath, resolvedTarget, 'file');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('EPERM')) {
        throw new Error(
          'Creating symlinks on Windows requires Developer Mode or admin privileges. ' +
          'Enable Developer Mode in Settings > Update & Security > For developers, ' +
          'or use "copy" mode instead.'
        );
      }
      throw error;
    }
  } else {
    await fs.symlink(sourcePath, resolvedTarget);
  }
  
  // Record the link
  const link: LinkInfo = {
    sourceId: sourceFileId,
    targetPath: resolvedTarget,
    type: 'symlink',
    autoSync: false,
    createdAt: new Date().toISOString(),
  };
  
  await addLink(link);
  
  return link;
}

/**
 * Create a copy of an env file at target path
 * This is useful for encrypted files or when symlinks aren't suitable
 */
export async function createCopy(
  sourceFileId: string,
  targetPath: string,
  encryptionOptions?: EncryptionOptions,
  autoSync: boolean = false
): Promise<LinkInfo> {
  const { metadata, variables } = await readEnvFile(sourceFileId, encryptionOptions);
  
  const resolvedTarget = path.resolve(targetPath);
  const targetDir = path.dirname(resolvedTarget);
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir);
  
  // Write decrypted content to target
  const content = serializeEnvContent(variables);
  await fs.writeFile(resolvedTarget, content);
  
  // Record the link
  const link: LinkInfo = {
    sourceId: sourceFileId,
    targetPath: resolvedTarget,
    type: 'copy',
    autoSync,
    createdAt: new Date().toISOString(),
  };
  
  await addLink(link);
  
  return link;
}

/**
 * Update all copies for a given source file
 */
export async function syncCopies(
  sourceFileId: string,
  encryptionOptions?: EncryptionOptions
): Promise<number> {
  const links = await _getLinksForEnvFile(sourceFileId);
  const copies = links.filter(l => l.type === 'copy');
  
  let synced = 0;
  
  for (const copy of copies) {
    try {
      const { variables } = await readEnvFile(sourceFileId, encryptionOptions);
      const content = serializeEnvContent(variables);
      await fs.writeFile(copy.targetPath, content);
      synced++;
    } catch (error) {
      console.error(`Failed to sync ${copy.targetPath}:`, error);
    }
  }
  
  return synced;
}

/**
 * Unlink a target path (remove symlink or copy)
 */
export async function unlink(targetPath: string): Promise<boolean> {
  const resolvedTarget = path.resolve(targetPath);
  
  // Remove from registry
  const removed = await removeLink(resolvedTarget);
  
  // Remove file if it exists
  if (await fs.pathExists(resolvedTarget)) {
    await fs.remove(resolvedTarget);
  }
  
  return removed;
}

/**
 * List all links
 */
export async function listLinks(): Promise<LinkInfo[]> {
  return getLinks();
}

/**
 * Check if a link is valid (target exists and matches source)
 */
export async function validateLink(link: LinkInfo): Promise<{
  valid: boolean;
  exists: boolean;
  isSymlink: boolean;
  error?: string;
}> {
  try {
    const exists = await fs.pathExists(link.targetPath);
    
    if (!exists) {
      return { valid: false, exists: false, isSymlink: false, error: 'Target does not exist' };
    }
    
    const stats = await fs.lstat(link.targetPath);
    const isSymlink = stats.isSymbolicLink();
    
    if (link.type === 'symlink' && !isSymlink) {
      return { valid: false, exists: true, isSymlink: false, error: 'Expected symlink but found regular file' };
    }
    
    if (link.type === 'symlink' && isSymlink) {
      // Verify symlink target
      const realPath = await fs.realpath(link.targetPath);
      const manifest = await getManifest();
      const metadata = manifest.files.find(f => f.id === link.sourceId);
      
      if (metadata) {
        const expectedPath = getEnvFilePath(link.sourceId, metadata.encrypted);
        if (realPath !== expectedPath) {
          return { valid: false, exists: true, isSymlink: true, error: 'Symlink points to wrong target' };
        }
      }
    }
    
    return { valid: true, exists: true, isSymlink };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { valid: false, exists: false, isSymlink: false, error: errorMessage };
  }
}

/**
 * Repair broken links
 */
export async function repairLinks(encryptionOptions?: EncryptionOptions): Promise<{
  repaired: number;
  removed: number;
  errors: string[];
}> {
  const links = await getLinks();
  let repaired = 0;
  let removed = 0;
  const errors: string[] = [];
  
  for (const link of links) {
    const validation = await validateLink(link);
    
    if (!validation.valid) {
      try {
        // Try to recreate the link
        if (link.type === 'symlink') {
          await unlink(link.targetPath);
          await createSymlink(link.sourceId, link.targetPath, encryptionOptions);
          repaired++;
        } else {
          await unlink(link.targetPath);
          await createCopy(link.sourceId, link.targetPath, encryptionOptions, link.autoSync);
          repaired++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // If source doesn't exist, remove the link
        if (errorMessage.includes('not found')) {
          await removeLink(link.targetPath);
          removed++;
        } else {
          errors.push(`${link.targetPath}: ${errorMessage}`);
        }
      }
    }
  }
  
  return { repaired, removed, errors };
}

