/**
 * Envmatic Type Definitions
 */

export interface EnvmaticConfig {
  /** Git repository URL for storage */
  repoUrl: string;
  /** Local path where repo is cloned */
  localPath: string;
  /** Whether encryption is enabled */
  encryptionEnabled: boolean;
  /** Encryption method: 'password' or 'ssh' */
  encryptionMethod?: 'password' | 'ssh';
  /** Path to SSH key if using SSH encryption */
  sshKeyPath?: string;
  /** Whether files should be immutable by default */
  immutableByDefault: boolean;
  /** Default branch name */
  branch: string;
  /** Last sync timestamp */
  lastSync?: string;
}

export interface EnvFile {
  /** Unique identifier (path in repo) */
  id: string;
  /** Display name */
  name: string;
  /** Project/category this belongs to */
  project: string;
  /** Environment (dev, staging, prod, etc.) */
  environment?: string;
  /** Description */
  description?: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last modified timestamp */
  updatedAt: string;
  /** Whether this file is encrypted */
  encrypted: boolean;
  /** Whether this file is immutable */
  immutable: boolean;
}

export interface EnvFileContent {
  /** Metadata about the file */
  metadata: EnvFile;
  /** Key-value pairs */
  variables: Record<string, string>;
}

export interface EnvmaticManifest {
  /** Version of the manifest format */
  version: string;
  /** All env files tracked */
  files: EnvFile[];
  /** Projects/categories */
  projects: string[];
}

export interface LinkInfo {
  /** Source file ID in envmatic */
  sourceId: string;
  /** Target path where symlink/copy exists */
  targetPath: string;
  /** Link type: symlink or copy */
  type: 'symlink' | 'copy';
  /** Whether to auto-sync on changes */
  autoSync: boolean;
  /** Created timestamp */
  createdAt: string;
}

export interface EncryptionOptions {
  method: 'password' | 'ssh';
  password?: string;
  sshKeyPath?: string;
}

