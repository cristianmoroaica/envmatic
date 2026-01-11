/**
 * Env File Service
 * Manages .env files in the vault
 */

import fs from 'fs-extra';
import path from 'path';
import { parse as parseDotenv, DotenvParseOutput } from 'dotenv';
import { VAULT_PATH, ENCRYPTED_EXT } from '../constants.js';
import { encrypt, decrypt } from './encryption.js';
import { getManifest, saveManifest, commitChanges } from './git.js';
import { getConfig } from './config.js';
import type { EnvFile, EnvFileContent, EncryptionOptions } from '../types/index.js';

/**
 * Generate file ID from project and environment
 */
export function generateFileId(project: string, environment: string, name: string = '.env'): string {
  return `${project}/${environment}/${name}`;
}

/**
 * Get the full path for an env file in the vault
 */
export function getEnvFilePath(fileId: string, encrypted: boolean = false): string {
  const ext = encrypted ? ENCRYPTED_EXT : '';
  return path.join(VAULT_PATH, fileId + ext);
}

/**
 * Parse .env content to key-value pairs
 */
export function parseEnvContent(content: string): Record<string, string> {
  // Use dotenv parser
  const parsed = parseDotenv(Buffer.from(content)) as DotenvParseOutput;
  return parsed;
}

/**
 * Serialize key-value pairs to .env format
 */
export function serializeEnvContent(variables: Record<string, string>): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(variables)) {
    // Quote values that contain special characters
    const needsQuotes = value.includes(' ') || 
                        value.includes('#') || 
                        value.includes('\n') ||
                        value.includes('"') ||
                        value.includes("'");
    
    if (needsQuotes) {
      // Escape double quotes and use double quotes
      const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  
  return lines.join('\n') + '\n';
}

/**
 * Create a new env file
 */
export async function createEnvFile(
  project: string,
  environment: string,
  variables: Record<string, string>,
  options: {
    name?: string;
    description?: string;
    encryptionOptions?: EncryptionOptions;
    immutable?: boolean;
  } = {}
): Promise<EnvFile> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Envmatic not configured. Run `envmatic init` first.');
  }
  
  const name = options.name || '.env';
  const fileId = generateFileId(project, environment, name);
  const encrypted = config.encryptionEnabled && !!options.encryptionOptions;
  const filePath = getEnvFilePath(fileId, encrypted);
  
  // Ensure directory exists
  await fs.ensureDir(path.dirname(filePath));
  
  // Serialize content
  let content = serializeEnvContent(variables);
  
  // Encrypt if needed
  if (encrypted && options.encryptionOptions) {
    content = await encrypt(content, options.encryptionOptions);
  }
  
  // Write file
  await fs.writeFile(filePath, content);
  
  // Create metadata
  const now = new Date().toISOString();
  const envFile: EnvFile = {
    id: fileId,
    name,
    project,
    environment,
    description: options.description,
    createdAt: now,
    updatedAt: now,
    encrypted,
    immutable: options.immutable ?? config.immutableByDefault,
  };
  
  // Update manifest
  const manifest = await getManifest();
  
  // Add project if new
  if (!manifest.projects.includes(project)) {
    manifest.projects.push(project);
  }
  
  // Add or update file entry
  const existingIndex = manifest.files.findIndex(f => f.id === fileId);
  if (existingIndex >= 0) {
    manifest.files[existingIndex] = envFile;
  } else {
    manifest.files.push(envFile);
  }
  
  await saveManifest(manifest);
  
  // Commit changes
  await commitChanges(`Add ${project}/${environment}/${name}`);
  
  return envFile;
}

/**
 * Read an env file
 */
export async function readEnvFile(
  fileId: string,
  encryptionOptions?: EncryptionOptions
): Promise<EnvFileContent> {
  const manifest = await getManifest();
  const metadata = manifest.files.find(f => f.id === fileId);
  
  if (!metadata) {
    throw new Error(`Env file not found: ${fileId}`);
  }
  
  const filePath = getEnvFilePath(fileId, metadata.encrypted);
  
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Env file not found on disk: ${filePath}`);
  }
  
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Decrypt if needed
  if (metadata.encrypted) {
    if (!encryptionOptions) {
      throw new Error('Encryption options required to read encrypted file');
    }
    content = await decrypt(content, encryptionOptions);
  }
  
  const variables = parseEnvContent(content);
  
  return {
    metadata,
    variables,
  };
}

/**
 * Update an env file
 */
export async function updateEnvFile(
  fileId: string,
  variables: Record<string, string>,
  encryptionOptions?: EncryptionOptions
): Promise<EnvFile> {
  const manifest = await getManifest();
  const metadataIndex = manifest.files.findIndex(f => f.id === fileId);
  
  if (metadataIndex < 0) {
    throw new Error(`Env file not found: ${fileId}`);
  }
  
  const metadata = manifest.files[metadataIndex];
  const filePath = getEnvFilePath(fileId, metadata.encrypted);
  
  // Serialize content
  let content = serializeEnvContent(variables);
  
  // Encrypt if needed
  if (metadata.encrypted) {
    if (!encryptionOptions) {
      throw new Error('Encryption options required to update encrypted file');
    }
    content = await encrypt(content, encryptionOptions);
  }
  
  // Write file
  await fs.writeFile(filePath, content);
  
  // Update metadata
  metadata.updatedAt = new Date().toISOString();
  manifest.files[metadataIndex] = metadata;
  
  await saveManifest(manifest);
  await commitChanges(`Update ${metadata.project}/${metadata.environment}/${metadata.name}`);
  
  return metadata;
}

/**
 * Delete an env file
 */
export async function deleteEnvFile(fileId: string): Promise<void> {
  const manifest = await getManifest();
  const metadata = manifest.files.find(f => f.id === fileId);
  
  if (!metadata) {
    throw new Error(`Env file not found: ${fileId}`);
  }
  
  const filePath = getEnvFilePath(fileId, metadata.encrypted);
  
  // Remove file
  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
  }
  
  // Update manifest
  manifest.files = manifest.files.filter(f => f.id !== fileId);
  
  // Remove project if no more files
  const projectFiles = manifest.files.filter(f => f.project === metadata.project);
  if (projectFiles.length === 0) {
    manifest.projects = manifest.projects.filter(p => p !== metadata.project);
  }
  
  await saveManifest(manifest);
  await commitChanges(`Delete ${metadata.project}/${metadata.environment}/${metadata.name}`);
}

/**
 * List all env files
 */
export async function listEnvFiles(project?: string): Promise<EnvFile[]> {
  const manifest = await getManifest();
  
  if (project) {
    return manifest.files.filter(f => f.project === project);
  }
  
  return manifest.files;
}

/**
 * List all projects
 */
export async function listProjects(): Promise<string[]> {
  const manifest = await getManifest();
  return manifest.projects;
}

/**
 * Import an existing .env file into the vault
 */
export async function importEnvFile(
  sourcePath: string,
  project: string,
  environment: string,
  options: {
    name?: string;
    description?: string;
    encryptionOptions?: EncryptionOptions;
    immutable?: boolean;
  } = {}
): Promise<EnvFile> {
  const content = await fs.readFile(sourcePath, 'utf-8');
  const variables = parseEnvContent(content);
  
  return createEnvFile(project, environment, variables, options);
}

/**
 * Export an env file to a target path
 */
export async function exportEnvFile(
  fileId: string,
  targetPath: string,
  encryptionOptions?: EncryptionOptions
): Promise<void> {
  const { variables } = await readEnvFile(fileId, encryptionOptions);
  const content = serializeEnvContent(variables);
  
  await fs.ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, content);
}

/**
 * Add or update a single variable in an env file
 */
export async function setVariable(
  fileId: string,
  key: string,
  value: string,
  encryptionOptions?: EncryptionOptions
): Promise<void> {
  const { variables } = await readEnvFile(fileId, encryptionOptions);
  variables[key] = value;
  await updateEnvFile(fileId, variables, encryptionOptions);
}

/**
 * Remove a variable from an env file
 */
export async function removeVariable(
  fileId: string,
  key: string,
  encryptionOptions?: EncryptionOptions
): Promise<void> {
  const { variables } = await readEnvFile(fileId, encryptionOptions);
  delete variables[key];
  await updateEnvFile(fileId, variables, encryptionOptions);
}

/**
 * Get a single variable value
 */
export async function getVariable(
  fileId: string,
  key: string,
  encryptionOptions?: EncryptionOptions
): Promise<string | undefined> {
  const { variables } = await readEnvFile(fileId, encryptionOptions);
  return variables[key];
}

