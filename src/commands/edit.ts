/**
 * Edit Command
 * Edit variables in an env file
 */

import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { 
  readEnvFile, 
  updateEnvFile, 
  setVariable, 
  removeVariable,
  listEnvFiles,
  getEnvFilePath,
  parseEnvContent,
  serializeEnvContent
} from '../services/envfile.js';
import { sync, commitChanges } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { makeMutable, makeImmutable } from '../services/protection.js';
import { syncCopies } from '../services/linker.js';
import { decrypt, encrypt } from '../services/encryption.js';
import { 
  printBanner, 
  success, 
  error, 
  info,
  warning,
  colors, 
  formatFileId,
  maskValue
} from '../utils/display.js';
import { getEncryptionOptions, select, confirm } from '../utils/prompts.js';
import { detectEditors, openInEditor, isTerminalEditor } from '../utils/editor.js';
import type { EncryptionOptions } from '../types/index.js';

/**
 * Edit command with optional external editor support
 */
export async function editCommand(
  fileId?: string,
  options: { editor?: boolean } = {}
): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  // If no file ID provided, prompt for selection
  if (!fileId) {
    const files = await listEnvFiles();
    
    if (files.length === 0) {
      error('No env files found. Add one with `envmatic add`');
      return;
    }
    
    fileId = await select(
      'Select an env file to edit:',
      files.map(f => ({
        name: `${f.project}/${f.environment || 'default'}/${f.name}`,
        value: f.id,
      }))
    );
  }
  
  const encryptionOptions = await getEncryptionOptions();
  
  try {
    const { metadata, variables } = await readEnvFile(fileId, encryptionOptions);
    
    console.log('Editing: ' + formatFileId(fileId) + '\n');
    
    // Make file mutable for editing
    const filePath = getEnvFilePath(fileId, metadata.encrypted);
    if (metadata.immutable) {
      await makeMutable(filePath);
    }
    
    // External editor mode
    if (options.editor) {
      await editWithExternalEditor(fileId, metadata, variables, encryptionOptions, filePath);
      return;
    }
    
    // Interactive edit loop
    let modified = false;
    
    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'View all variables', value: 'view' },
            { name: 'Add/Update a variable', value: 'set' },
            { name: 'Remove a variable', value: 'remove' },
            new inquirer.Separator(),
            { name: 'Save and exit', value: 'save' },
            { name: 'Discard changes and exit', value: 'cancel' },
          ],
        },
      ]);
      
      if (action === 'view') {
        console.log();
        for (const [key, value] of Object.entries(variables)) {
          console.log(`  ${colors.secondary(key)} = ${maskValue(value)}`);
        }
        console.log();
        
      } else if (action === 'set') {
        const { key, value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Variable name:',
            validate: (input: string) => input.trim().length > 0 || 'Name is required',
          },
          {
            type: 'input',
            name: 'value',
            message: 'Value:',
          },
        ]);
        
        const oldValue = variables[key.trim()];
        variables[key.trim()] = value;
        modified = true;
        
        if (oldValue !== undefined) {
          info(`Updated: ${key}`);
        } else {
          success(`Added: ${key}`);
        }
        
      } else if (action === 'remove') {
        const keys = Object.keys(variables);
        
        if (keys.length === 0) {
          info('No variables to remove.');
          continue;
        }
        
        const { keyToRemove } = await inquirer.prompt([
          {
            type: 'list',
            name: 'keyToRemove',
            message: 'Select variable to remove:',
            choices: keys,
          },
        ]);
        
        delete variables[keyToRemove];
        modified = true;
        success(`Removed: ${keyToRemove}`);
        
      } else if (action === 'save') {
        if (modified) {
          const spinner = ora('Saving changes...').start();
          
          await updateEnvFile(fileId, variables, encryptionOptions);
          
          // Re-apply protection if needed
          if (metadata.immutable) {
            await makeImmutable(filePath);
          }
          
          spinner.succeed('Changes saved');
          
          // Sync copies
          await syncCopies(fileId, encryptionOptions);
          
          // Sync to remote
          const syncSpinner = ora('Syncing to remote...').start();
          try {
            await sync();
            syncSpinner.succeed('Synced');
          } catch {
            syncSpinner.warn('Could not sync (will sync later)');
          }
          
          console.log();
          success('File updated successfully!');
        } else {
          info('No changes to save.');
        }
        break;
        
      } else if (action === 'cancel') {
        if (modified) {
          const confirmCancel = await confirm('Discard all changes?', false);
          if (!confirmCancel) {
            continue;
          }
        }
        
        // Restore protection
        if (metadata.immutable) {
          await makeImmutable(filePath);
        }
        
        info('Changes discarded.');
        break;
      }
    }
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

/**
 * Edit a file using an external editor
 */
async function editWithExternalEditor(
  fileId: string,
  metadata: { encrypted: boolean; immutable: boolean },
  variables: Record<string, string>,
  encryptionOptions: EncryptionOptions | undefined,
  filePath: string
): Promise<void> {
  // Detect available editors
  const detectSpinner = ora('Detecting available editors...').start();
  const editors = await detectEditors();
  detectSpinner.stop();
  
  if (editors.length === 0) {
    error('No editors found on your system.');
    info('Set the EDITOR environment variable to specify your preferred editor.');
    
    // Restore protection
    if (metadata.immutable) {
      await makeImmutable(filePath);
    }
    return;
  }
  
  // Let user choose editor
  const { editorChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'editorChoice',
      message: 'Choose an editor:',
      choices: editors.map(e => ({
        name: e.name,
        value: e.command,
      })),
    },
  ]);
  
  // For encrypted files, we need to create a temporary decrypted file
  let editFilePath = filePath;
  let tempFilePath: string | null = null;
  
  if (metadata.encrypted) {
    // Create a temp file with decrypted content
    const tempDir = os.tmpdir();
    const tempFileName = `envmatic-edit-${Date.now()}.env`;
    tempFilePath = path.join(tempDir, tempFileName);
    
    const content = serializeEnvContent(variables);
    await fs.writeFile(tempFilePath, content);
    editFilePath = tempFilePath;
    
    console.log();
    info('Created temporary decrypted file for editing.');
  }
  
  console.log();
  console.log(colors.warning('┌─────────────────────────────────────────────────────────────┐'));
  console.log(colors.warning('│') + colors.accent(' 🔓 FILE UNLOCKED FOR EDITING                                ') + colors.warning('│'));
  console.log(colors.warning('├─────────────────────────────────────────────────────────────┤'));
  console.log(colors.warning('│') + '  The file is now unlocked and editable.                     ' + colors.warning('│'));
  console.log(colors.warning('│') + '                                                             ' + colors.warning('│'));
  console.log(colors.warning('│') + '  After you finish editing and close the editor:             ' + colors.warning('│'));
  console.log(colors.warning('│') + '  • Changes will be saved automatically                      ' + colors.warning('│'));
  console.log(colors.warning('│') + '  • The file will be re-encrypted (if applicable)            ' + colors.warning('│'));
  console.log(colors.warning('│') + '  • You\'ll be prompted to sync and lock                      ' + colors.warning('│'));
  console.log(colors.warning('│') + '                                                             ' + colors.warning('│'));
  console.log(colors.warning('│') + '  If something goes wrong, run:                              ' + colors.warning('│'));
  console.log(colors.warning('│') + colors.primary('  envmatic lock                                              ') + colors.warning('│'));
  console.log(colors.warning('└─────────────────────────────────────────────────────────────┘'));
  console.log();
  
  // Open editor and wait
  const editorSpinner = ora('Opening editor...').start();
  
  try {
    // For terminal editors, stop the spinner before opening
    if (isTerminalEditor(editorChoice)) {
      editorSpinner.stop();
      console.log(colors.muted('Opening editor... (save and quit when done)\n'));
    }
    
    await openInEditor(editFilePath, editorChoice);
    
    if (!isTerminalEditor(editorChoice)) {
      editorSpinner.succeed('Editor closed');
    }
    
    // Read the edited content
    const editedContent = await fs.readFile(editFilePath, 'utf-8');
    const editedVariables = parseEnvContent(editedContent);
    
    // Check if content changed
    const originalContent = serializeEnvContent(variables);
    const newContent = serializeEnvContent(editedVariables);
    
    if (originalContent === newContent) {
      info('No changes detected.');
      
      // Clean up temp file
      if (tempFilePath) {
        await fs.remove(tempFilePath);
      }
      
      // Ask if they want to lock the file
      const shouldLock = await confirm('Lock the file?', true);
      if (shouldLock && metadata.immutable) {
        await makeImmutable(filePath);
        success('File locked.');
      } else if (!shouldLock) {
        console.log();
        warning('File remains unlocked. Run `envmatic lock` when done.');
      }
      
      return;
    }
    
    // Save changes
    const saveSpinner = ora('Saving changes...').start();
    
    await updateEnvFile(fileId, editedVariables, encryptionOptions);
    
    saveSpinner.succeed('Changes saved');
    
    // Clean up temp file
    if (tempFilePath) {
      await fs.remove(tempFilePath);
    }
    
    // Sync copies
    await syncCopies(fileId, encryptionOptions);
    
    // Sync to remote
    const shouldSync = await confirm('Sync changes to remote?', true);
    
    if (shouldSync) {
      const syncSpinner = ora('Syncing to remote...').start();
      try {
        await sync();
        syncSpinner.succeed('Synced');
      } catch {
        syncSpinner.warn('Could not sync (will sync later)');
      }
    }
    
    // Lock the file
    const shouldLock = await confirm('Lock the file?', true);
    
    if (shouldLock && metadata.immutable) {
      await makeImmutable(filePath);
      success('File locked.');
    } else if (!shouldLock) {
      console.log();
      warning('File remains unlocked. Run `envmatic lock` when done.');
    }
    
    console.log();
    success('File updated successfully!');
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Editor error: ${errorMessage}`);
    
    // Clean up temp file on error
    if (tempFilePath && await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
    
    console.log();
    warning('File may still be unlocked. Run `envmatic lock` to secure it.');
  }
}

export async function setCommand(
  fileId: string,
  key: string,
  value: string
): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const encryptionOptions = await getEncryptionOptions();
  
  const spinner = ora('Setting variable...').start();
  
  try {
    await setVariable(fileId, key, value, encryptionOptions);
    await syncCopies(fileId, encryptionOptions);
    
    spinner.succeed(`Set ${key} in ${fileId}`);
    
    // Sync
    try {
      await sync();
    } catch {
      // Ignore sync errors
    }
    
  } catch (err) {
    spinner.fail('Failed to set variable');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

export async function unsetCommand(fileId: string, key: string): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const encryptionOptions = await getEncryptionOptions();
  
  const spinner = ora('Removing variable...').start();
  
  try {
    await removeVariable(fileId, key, encryptionOptions);
    await syncCopies(fileId, encryptionOptions);
    
    spinner.succeed(`Removed ${key} from ${fileId}`);
    
    // Sync
    try {
      await sync();
    } catch {
      // Ignore sync errors
    }
    
  } catch (err) {
    spinner.fail('Failed to remove variable');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

