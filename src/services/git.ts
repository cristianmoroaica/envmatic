/**
 * Git Service
 * Handles all Git operations for the vault repository
 */

import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import { VAULT_PATH, DEFAULT_BRANCH, MANIFEST_FILE } from '../constants.js';
import type { EnvmaticManifest } from '../types/index.js';

let gitInstance: SimpleGit | null = null;

/**
 * Get or create git instance for vault
 */
function getGit(): SimpleGit {
  if (!gitInstance) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: VAULT_PATH,
      binary: 'git',
      maxConcurrentProcesses: 1,
      trimmed: false,
    };
    gitInstance = simpleGit(options);
  }
  return gitInstance!;
}

/**
 * Check if vault is initialized (git repo exists)
 */
export async function isVaultInitialized(): Promise<boolean> {
  try {
    const gitDir = path.join(VAULT_PATH, '.git');
    return await fs.pathExists(gitDir);
  } catch {
    return false;
  }
}

/**
 * Clone the remote repository to vault path
 */
export async function cloneRepository(repoUrl: string, branch: string = DEFAULT_BRANCH): Promise<void> {
  await fs.ensureDir(VAULT_PATH);
  
  // Check if directory is empty
  const files = await fs.readdir(VAULT_PATH);
  const nonHiddenFiles = files.filter(f => !f.startsWith('.'));
  
  if (nonHiddenFiles.length > 0 || files.includes('.git')) {
    throw new Error('Vault directory is not empty. Please remove existing files first.');
  }
  
  const git = simpleGit();
  await git.clone(repoUrl, VAULT_PATH, ['--branch', branch]);
  
  // Reset instance to use new repo
  gitInstance = null;
}

/**
 * Initialize a new git repository in vault (for first-time setup with empty repo)
 */
export async function initRepository(repoUrl: string, branch: string = DEFAULT_BRANCH): Promise<void> {
  await fs.ensureDir(VAULT_PATH);
  
  const git = getGit();
  await git.init();
  await git.addRemote('origin', repoUrl);
  await git.checkout(['-b', branch]);
  
  // Create initial manifest
  const manifest: EnvmaticManifest = {
    version: '1.0.0',
    files: [],
    projects: [],
  };
  
  const manifestPath = path.join(VAULT_PATH, MANIFEST_FILE);
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  
  // Create .gitignore to exclude local-only files
  const gitignorePath = path.join(VAULT_PATH, '.gitignore');
  await fs.writeFile(gitignorePath, '# Local files\n.envmatic-local\n');
  
  // Create README
  const readmePath = path.join(VAULT_PATH, 'README.md');
  await fs.writeFile(readmePath, `# Envmatic Vault

This repository is managed by [Envmatic](https://github.com/envmatic).

**⚠️ This is a private repository containing encrypted secrets.**

## Structure

\`\`\`
vault/
├── <project-name>/
│   ├── development/
│   │   └── .env.enc
│   ├── staging/
│   │   └── .env.enc
│   └── production/
│       └── .env.enc
└── shared/
    └── common/
        └── .env.enc
\`\`\`

Do not manually edit encrypted files. Use the Envmatic CLI to manage secrets.
`);
  
  await git.add('.');
  await git.commit('Initial envmatic vault setup');
}

/**
 * Pull latest changes from remote
 */
export async function pull(): Promise<void> {
  const git = getGit();
  await git.pull();
}

/**
 * Push changes to remote (always sets upstream to handle fresh repos)
 */
export async function push(): Promise<void> {
  const git = getGit();
  const status = await git.status();
  const branch = status.current || 'main';
  
  try {
    // Try normal push first
    await git.push();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // If no upstream, set it and push
    if (errorMessage.includes('no upstream') || errorMessage.includes('set-upstream')) {
      await git.push(['-u', 'origin', branch]);
    } else {
      throw error;
    }
  }
}

/**
 * Stage and commit changes
 */
export async function commitChanges(message: string): Promise<void> {
  const git = getGit();
  await git.add('.');
  
  // Check if there are changes to commit
  const status = await git.status();
  if (status.files.length === 0) {
    return; // Nothing to commit
  }
  
  await git.commit(message);
}

/**
 * Sync: commit changes, pull, then push
 */
export async function sync(): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
  const git = getGit();
  
  let pulled = false;
  let pushed = false;
  let committed = false;
  
  // First, commit any uncommitted changes
  const preStatus = await git.status();
  if (preStatus.files.length > 0) {
    await git.add('.');
    await git.commit('Sync from envmatic');
    committed = true;
  }
  
  try {
    await git.pull();
    pulled = true;
  } catch (error) {
    // If pull fails due to no upstream, that's okay for new repos
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('no tracking information')) {
      throw error;
    }
  }
  
  try {
    const status = await git.status();
    if (status.ahead > 0) {
      await git.push(['-u', 'origin', 'HEAD']);
      pushed = true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Handle first push to empty remote
    if (errorMessage.includes('has no upstream')) {
      await git.push(['-u', 'origin', 'HEAD']);
      pushed = true;
    } else {
      throw error;
    }
  }
  
  return { pulled, pushed, committed };
}

/**
 * Get current status
 */
export async function getStatus(): Promise<{
  branch: string;
  ahead: number;
  behind: number;
  modified: number;
  staged: number;
}> {
  const git = getGit();
  const status = await git.status();
  
  return {
    branch: status.current || DEFAULT_BRANCH,
    ahead: status.ahead,
    behind: status.behind,
    modified: status.modified.length + status.not_added.length,
    staged: status.staged.length,
  };
}

/**
 * Check if remote is accessible
 */
export async function checkRemoteAccess(repoUrl: string): Promise<boolean> {
  try {
    const git = simpleGit();
    await git.listRemote([repoUrl]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the manifest from the vault
 */
export async function getManifest(): Promise<EnvmaticManifest> {
  const manifestPath = path.join(VAULT_PATH, MANIFEST_FILE);
  
  if (await fs.pathExists(manifestPath)) {
    return fs.readJson(manifestPath);
  }
  
  // Return empty manifest if not found
  return {
    version: '1.0.0',
    files: [],
    projects: [],
  };
}

/**
 * Save the manifest to the vault
 */
export async function saveManifest(manifest: EnvmaticManifest): Promise<void> {
  const manifestPath = path.join(VAULT_PATH, MANIFEST_FILE);
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
}

