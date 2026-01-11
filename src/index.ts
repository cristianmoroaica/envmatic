/**
 * Envmatic
 * Cross-platform dotfile and secret manager
 * 
 * This module exports the core functionality for programmatic usage.
 */

// Types
export type {
  EnvmaticConfig,
  EnvFile,
  EnvFileContent,
  EnvmaticManifest,
  LinkInfo,
  EncryptionOptions,
} from './types/index.js';

// Constants
export {
  ENVMATIC_HOME,
  VAULT_PATH,
  VERSION,
} from './constants.js';

// Config management
export {
  isConfigured,
  getConfig,
  saveConfig,
  updateConfig,
  getEnvmaticHome,
} from './services/config.js';

// Encryption
export {
  encrypt,
  decrypt,
  verifyEncryption,
} from './services/encryption.js';

// Git operations
export {
  isVaultInitialized,
  sync,
  pull,
  push,
  getStatus,
} from './services/git.js';

// Env file operations
export {
  createEnvFile,
  readEnvFile,
  updateEnvFile,
  deleteEnvFile,
  listEnvFiles,
  listProjects,
  importEnvFile,
  exportEnvFile,
  setVariable,
  removeVariable,
  getVariable,
  parseEnvContent,
  serializeEnvContent,
} from './services/envfile.js';

// Linker operations
export {
  createSymlink,
  createCopy,
  unlink,
  listLinks,
  syncCopies,
} from './services/linker.js';

// Protection
export {
  makeImmutable,
  makeMutable,
  isImmutable,
} from './services/protection.js';

