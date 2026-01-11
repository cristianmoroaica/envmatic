/**
 * Edit Command
 * Edit variables in an env file
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { 
  readEnvFile, 
  updateEnvFile, 
  setVariable, 
  removeVariable,
  listEnvFiles,
  getEnvFilePath
} from '../services/envfile.js';
import { sync } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { makeMutable, makeImmutable } from '../services/protection.js';
import { syncCopies } from '../services/linker.js';
import { 
  printBanner, 
  success, 
  error, 
  info,
  colors, 
  formatFileId,
  maskValue
} from '../utils/display.js';
import { getEncryptionOptions, select, confirm } from '../utils/prompts.js';

export async function editCommand(fileId?: string): Promise<void> {
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

