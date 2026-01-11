/**
 * File Protection Service
 * Handles file immutability and protection features
 */

import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Get the current platform
 */
function getPlatform(): 'windows' | 'macos' | 'linux' {
  const platform = os.platform();
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

/**
 * Make a file immutable (read-only and protected from modification)
 * 
 * On Windows: Uses attrib +R
 * On macOS/Linux: Uses chmod and chflags (where available)
 */
export async function makeImmutable(filePath: string): Promise<boolean> {
  const platform = getPlatform();
  
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    switch (platform) {
      case 'windows':
        // Set read-only attribute
        await execAsync(`attrib +R "${filePath}"`);
        return true;
        
      case 'macos':
        // Set user immutable flag (requires ownership)
        try {
          await execAsync(`chflags uchg "${filePath}"`);
        } catch {
          // Fallback to chmod if chflags fails
          await fs.chmod(filePath, 0o444);
        }
        return true;
        
      case 'linux':
        // Use chmod to make read-only
        await fs.chmod(filePath, 0o444);
        return true;
        
      default:
        return false;
    }
  } catch (error) {
    console.error('Failed to make file immutable:', error);
    return false;
  }
}

/**
 * Make a file mutable (remove protection)
 */
export async function makeMutable(filePath: string): Promise<boolean> {
  const platform = getPlatform();
  
  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    switch (platform) {
      case 'windows':
        // Remove read-only attribute
        await execAsync(`attrib -R "${filePath}"`);
        return true;
        
      case 'macos':
        // Remove user immutable flag
        try {
          await execAsync(`chflags nouchg "${filePath}"`);
        } catch {
          // Ignore if chflags fails
        }
        await fs.chmod(filePath, 0o644);
        return true;
        
      case 'linux':
        await fs.chmod(filePath, 0o644);
        return true;
        
      default:
        return false;
    }
  } catch (error) {
    console.error('Failed to make file mutable:', error);
    return false;
  }
}

/**
 * Check if a file is immutable
 */
export async function isImmutable(filePath: string): Promise<boolean> {
  const platform = getPlatform();
  
  try {
    if (!(await fs.pathExists(filePath))) {
      return false;
    }
    
    const stats = await fs.stat(filePath);
    
    switch (platform) {
      case 'windows':
        // Check if file is read-only
        // On Windows, we can try to open for writing and see if it fails
        try {
          const fd = await fs.open(filePath, 'r+');
          await fs.close(fd);
          return false; // File is writable
        } catch {
          return true; // File is read-only
        }
        
      case 'macos':
      case 'linux':
        // Check if write permission is removed
        const mode = stats.mode;
        const ownerWrite = (mode & 0o200) !== 0;
        const groupWrite = (mode & 0o020) !== 0;
        const otherWrite = (mode & 0o002) !== 0;
        return !ownerWrite && !groupWrite && !otherWrite;
        
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Protect a directory (make all files immutable)
 */
export async function protectDirectory(dirPath: string): Promise<number> {
  let count = 0;
  
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = `${dirPath}/${file.name}`;
    
    if (file.isDirectory()) {
      count += await protectDirectory(fullPath);
    } else if (file.isFile()) {
      if (await makeImmutable(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Unprotect a directory (make all files mutable)
 */
export async function unprotectDirectory(dirPath: string): Promise<number> {
  let count = 0;
  
  const files = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = `${dirPath}/${file.name}`;
    
    if (file.isDirectory()) {
      count += await unprotectDirectory(fullPath);
    } else if (file.isFile()) {
      if (await makeMutable(fullPath)) {
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Temporarily make file writable, execute callback, then restore protection
 */
export async function withWriteAccess<T>(
  filePath: string,
  callback: () => Promise<T>
): Promise<T> {
  const wasImmutable = await isImmutable(filePath);
  
  if (wasImmutable) {
    await makeMutable(filePath);
  }
  
  try {
    return await callback();
  } finally {
    if (wasImmutable) {
      await makeImmutable(filePath);
    }
  }
}

