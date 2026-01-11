import os from 'os';
import path from 'path';

/**
 * Envmatic Constants
 */

// Base directory for envmatic data
export const ENVMATIC_HOME = path.join(os.homedir(), '.envmatic');

// Config file path
export const CONFIG_PATH = path.join(ENVMATIC_HOME, 'config.json');

// Directory where git repo is cloned
export const VAULT_PATH = path.join(ENVMATIC_HOME, 'vault');

// Links registry (tracks symlinks and copies)
export const LINKS_PATH = path.join(ENVMATIC_HOME, 'links.json');

// Manifest file name (stored in repo)
export const MANIFEST_FILE = '.envmatic-manifest.json';

// Encryption salt file
export const SALT_FILE = '.envmatic-salt';

// File extension for encrypted files
export const ENCRYPTED_EXT = '.enc';

// Default branch name
export const DEFAULT_BRANCH = 'main';

// Version
export const VERSION = '1.0.0';

// Folder structure inside vault
export const VAULT_STRUCTURE = {
  // Each project gets its own folder
  // Inside each project folder, environments are organized
  // Example: vault/myapp/development/.env
  //          vault/myapp/production/.env
  //          vault/shared/secrets/.env
};

// Environment presets
export const ENV_PRESETS = [
  'development',
  'staging',
  'production',
  'test',
  'local',
  'ci',
] as const;

// CLI styling
export const BRAND = {
  name: 'Envmatic',
  tagline: 'Your secrets, your control.',
  prefix: '◆',
};

