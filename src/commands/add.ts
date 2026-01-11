/**
 * Add Command
 * Add a new env file to the vault
 */

import ora from 'ora';
import { createEnvFile, listProjects } from '../services/envfile.js';
import { commitChanges, sync } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { makeImmutable } from '../services/protection.js';
import { getEnvFilePath } from '../services/envfile.js';
import { printBanner, success, error, info, formatFileId, colors } from '../utils/display.js';
import { 
  promptProject, 
  promptEnvironment, 
  promptVariables,
  getEncryptionOptions 
} from '../utils/prompts.js';

export async function addCommand(options: {
  project?: string;
  environment?: string;
  name?: string;
  description?: string;
}): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  console.log('Add a new environment file to your vault.\n');
  
  // Get project
  const projects = await listProjects();
  const project = options.project || await promptProject(projects);
  
  // Get environment
  const environment = options.environment || await promptEnvironment();
  
  // Get variables
  const variables = await promptVariables();
  
  if (Object.keys(variables).length === 0) {
    error('No variables provided. Aborting.');
    return;
  }
  
  // Get encryption options
  const encryptionOptions = await getEncryptionOptions();
  
  // Create the file
  const spinner = ora('Creating env file...').start();
  
  try {
    const envFile = await createEnvFile(project, environment, variables, {
      name: options.name || '.env',
      description: options.description,
      encryptionOptions,
      immutable: config.immutableByDefault,
    });
    
    // Apply file protection if needed
    if (envFile.immutable) {
      const filePath = getEnvFilePath(envFile.id, envFile.encrypted);
      await makeImmutable(filePath);
    }
    
    spinner.succeed('Env file created');
    
    // Sync to remote
    const syncSpinner = ora('Syncing to remote...').start();
    
    try {
      await sync();
      syncSpinner.succeed('Synced to remote');
    } catch {
      syncSpinner.warn('Could not sync to remote (will sync later)');
    }
    
    console.log();
    success('Environment file added successfully!');
    console.log();
    console.log('  File ID: ' + formatFileId(envFile.id));
    console.log('  Variables: ' + Object.keys(variables).length);
    console.log('  Encrypted: ' + (envFile.encrypted ? colors.secondary('yes') : 'no'));
    console.log('  Immutable: ' + (envFile.immutable ? colors.secondary('yes') : 'no'));
    console.log();
    console.log(colors.muted('Use this file:'));
    console.log('  • Link to project: ' + colors.primary(`envmatic link "${envFile.id}" .env`));
    console.log('  • Copy to project: ' + colors.primary(`envmatic copy "${envFile.id}" .env`));
    console.log('  • View contents:   ' + colors.primary(`envmatic show "${envFile.id}"`));
    
  } catch (err) {
    spinner.fail('Failed to create env file');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

