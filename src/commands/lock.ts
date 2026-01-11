/**
 * Lock Command
 * List and lock mutable (unlocked) env files
 */

import ora from 'ora';
import inquirer from 'inquirer';
import { listEnvFiles, getEnvFilePath, readEnvFile, updateEnvFile } from '../services/envfile.js';
import { sync, commitChanges } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { makeImmutable, isImmutable } from '../services/protection.js';
import { syncCopies } from '../services/linker.js';
import { 
  printBanner, 
  success, 
  error, 
  info,
  warning,
  colors,
  formatFileId
} from '../utils/display.js';
import { getEncryptionOptions, confirm } from '../utils/prompts.js';
import type { EnvFile } from '../types/index.js';

interface UnlockedFile {
  file: EnvFile;
  filePath: string;
}

/**
 * Find all unlocked (mutable) env files
 */
async function findUnlockedFiles(): Promise<UnlockedFile[]> {
  const files = await listEnvFiles();
  const unlocked: UnlockedFile[] = [];
  
  for (const file of files) {
    // Only check files that should be immutable
    if (file.immutable) {
      const filePath = getEnvFilePath(file.id, file.encrypted);
      const currentlyImmutable = await isImmutable(filePath);
      
      if (!currentlyImmutable) {
        unlocked.push({ file, filePath });
      }
    }
  }
  
  return unlocked;
}

/**
 * Lock a single file
 */
async function lockFile(file: EnvFile, filePath: string): Promise<boolean> {
  try {
    await makeImmutable(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lock command - list and lock mutable files
 */
export async function lockCommand(
  fileId?: string,
  options: { all?: boolean } = {}
): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  // If specific file ID provided, lock just that file
  if (fileId) {
    const files = await listEnvFiles();
    const file = files.find(f => f.id === fileId);
    
    if (!file) {
      error(`Env file not found: ${fileId}`);
      return;
    }
    
    const filePath = getEnvFilePath(file.id, file.encrypted);
    const currentlyImmutable = await isImmutable(filePath);
    
    if (currentlyImmutable) {
      info(`${formatFileId(fileId)} is already locked.`);
      return;
    }
    
    const spinner = ora('Locking file...').start();
    
    const locked = await lockFile(file, filePath);
    
    if (locked) {
      spinner.succeed('File locked');
      
      // If file was edited, we should sync
      const shouldSync = await confirm('Sync changes to remote?', true);
      
      if (shouldSync) {
        const encryptionOptions = await getEncryptionOptions();
        
        // Re-encrypt if needed (in case content was modified)
        try {
          const { variables } = await readEnvFile(file.id, encryptionOptions);
          await updateEnvFile(file.id, variables, encryptionOptions);
          await syncCopies(file.id, encryptionOptions);
        } catch (err) {
          // File might not have been modified, that's ok
        }
        
        const syncSpinner = ora('Syncing to remote...').start();
        try {
          await commitChanges(`Update ${file.id}`);
          await sync();
          syncSpinner.succeed('Synced');
        } catch {
          syncSpinner.warn('Could not sync (will sync later)');
        }
      }
      
      console.log();
      success(`${formatFileId(fileId)} is now locked.`);
    } else {
      spinner.fail('Failed to lock file');
    }
    
    return;
  }
  
  // Find all unlocked files
  const unlockedFiles = await findUnlockedFiles();
  
  if (unlockedFiles.length === 0) {
    success('All files are locked.');
    console.log();
    console.log(colors.muted('No unlocked files found.'));
    return;
  }
  
  console.log(colors.warning(`Found ${unlockedFiles.length} unlocked file(s):\n`));
  
  for (const { file } of unlockedFiles) {
    const flags = [];
    if (file.encrypted) flags.push('🔒');
    const flagStr = flags.length > 0 ? ' ' + flags.join(' ') : '';
    
    console.log(`  ${colors.accent('🔓')} ${formatFileId(file.id)}${flagStr}`);
  }
  
  console.log();
  
  // Lock all option
  if (options.all) {
    const spinner = ora('Locking all files...').start();
    
    let locked = 0;
    let failed = 0;
    
    for (const { file, filePath } of unlockedFiles) {
      if (await lockFile(file, filePath)) {
        locked++;
      } else {
        failed++;
      }
    }
    
    if (failed > 0) {
      spinner.warn(`Locked ${locked} file(s), ${failed} failed`);
    } else {
      spinner.succeed(`Locked ${locked} file(s)`);
    }
    
    // Sync changes
    const shouldSync = await confirm('Sync changes to remote?', true);
    
    if (shouldSync) {
      const syncSpinner = ora('Syncing to remote...').start();
      try {
        await commitChanges('Lock files after editing');
        await sync();
        syncSpinner.succeed('Synced');
      } catch {
        syncSpinner.warn('Could not sync (will sync later)');
      }
    }
    
    console.log();
    success('All files locked.');
    return;
  }
  
  // Interactive selection
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Lock all unlocked files', value: 'all' },
        { name: 'Select files to lock', value: 'select' },
        { name: 'Cancel', value: 'cancel' },
      ],
    },
  ]);
  
  if (action === 'cancel') {
    info('No files were locked.');
    console.log();
    warning('Remember: Unlocked files are not protected from accidental edits.');
    return;
  }
  
  if (action === 'all') {
    return lockCommand(undefined, { all: true });
  }
  
  // Select specific files
  const { selectedFiles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: 'Select files to lock:',
      choices: unlockedFiles.map(({ file }) => ({
        name: file.id,
        value: file.id,
        checked: true,
      })),
    },
  ]);
  
  if (selectedFiles.length === 0) {
    info('No files selected.');
    return;
  }
  
  const spinner = ora('Locking selected files...').start();
  
  let locked = 0;
  let failed = 0;
  
  for (const id of selectedFiles) {
    const item = unlockedFiles.find(u => u.file.id === id);
    if (item && await lockFile(item.file, item.filePath)) {
      locked++;
    } else {
      failed++;
    }
  }
  
  if (failed > 0) {
    spinner.warn(`Locked ${locked} file(s), ${failed} failed`);
  } else {
    spinner.succeed(`Locked ${locked} file(s)`);
  }
  
  // Sync changes
  const shouldSync = await confirm('Sync changes to remote?', true);
  
  if (shouldSync) {
    const syncSpinner = ora('Syncing to remote...').start();
    try {
      await commitChanges('Lock files after editing');
      await sync();
      syncSpinner.succeed('Synced');
    } catch {
      syncSpinner.warn('Could not sync (will sync later)');
    }
  }
  
  console.log();
  success('Selected files locked.');
}

/**
 * Unlock command - unlock a file for editing
 * (This is primarily used internally by the edit --editor command)
 */
export async function unlockFileForEditing(fileId: string): Promise<string | null> {
  const files = await listEnvFiles();
  const file = files.find(f => f.id === fileId);
  
  if (!file) {
    return null;
  }
  
  const filePath = getEnvFilePath(file.id, file.encrypted);
  
  // Make it mutable
  const { makeMutable } = await import('../services/protection.js');
  await makeMutable(filePath);
  
  return filePath;
}

