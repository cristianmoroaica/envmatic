/**
 * Encryption Service
 * Handles AES-256-GCM encryption with password or SSH key derivation
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { VAULT_PATH, SALT_FILE } from '../constants.js';
import type { EncryptionOptions } from '../types/index.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * Get or create a persistent salt for key derivation
 */
async function getSalt(): Promise<Buffer> {
  const saltPath = path.join(VAULT_PATH, SALT_FILE);
  
  if (await fs.pathExists(saltPath)) {
    return fs.readFile(saltPath);
  }
  
  const salt = crypto.randomBytes(SALT_LENGTH);
  await fs.ensureDir(VAULT_PATH);
  await fs.writeFile(saltPath, salt);
  return salt;
}

/**
 * Derive encryption key from password
 */
async function deriveKeyFromPassword(password: string): Promise<Buffer> {
  const salt = await getSalt();
  
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Derive encryption key from SSH private key
 */
async function deriveKeyFromSSH(sshKeyPath: string): Promise<Buffer> {
  const keyContent = await fs.readFile(sshKeyPath, 'utf-8');
  const salt = await getSalt();
  
  // Use the SSH key content as the password for PBKDF2
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(keyContent, salt, ITERATIONS, KEY_LENGTH, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Get encryption key based on options
 */
async function getEncryptionKey(options: EncryptionOptions): Promise<Buffer> {
  if (options.method === 'ssh' && options.sshKeyPath) {
    return deriveKeyFromSSH(options.sshKeyPath);
  }
  
  if (options.method === 'password' && options.password) {
    return deriveKeyFromPassword(options.password);
  }
  
  throw new Error('Invalid encryption options: password or SSH key path required');
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(data: string, options: EncryptionOptions): Promise<string> {
  const key = await getEncryptionKey(options);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + AuthTag + Encrypted data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ]);
  
  return combined.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 */
export async function decrypt(encryptedData: string, options: EncryptionOptions): Promise<string> {
  const key = await getEncryptionKey(options);
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract IV, AuthTag, and encrypted content
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

/**
 * Encrypt a file in place
 */
export async function encryptFile(
  filePath: string, 
  options: EncryptionOptions
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const encrypted = await encrypt(content, options);
  await fs.writeFile(filePath, encrypted);
}

/**
 * Decrypt a file and return content (does not modify file)
 */
export async function decryptFile(
  filePath: string, 
  options: EncryptionOptions
): Promise<string> {
  const encrypted = await fs.readFile(filePath, 'utf-8');
  return decrypt(encrypted, options);
}

/**
 * Verify that encryption options are valid (test encrypt/decrypt cycle)
 */
export async function verifyEncryption(options: EncryptionOptions): Promise<boolean> {
  try {
    const testData = 'envmatic-verification-test';
    const encrypted = await encrypt(testData, options);
    const decrypted = await decrypt(encrypted, options);
    return decrypted === testData;
  } catch {
    return false;
  }
}

/**
 * Check if SSH key file exists and is readable
 */
export async function validateSSHKey(sshKeyPath: string): Promise<boolean> {
  try {
    await fs.access(sshKeyPath, fs.constants.R_OK);
    const content = await fs.readFile(sshKeyPath, 'utf-8');
    return content.includes('PRIVATE KEY');
  } catch {
    return false;
  }
}

