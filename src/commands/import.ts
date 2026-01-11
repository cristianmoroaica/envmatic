/**
 * Import Command
 * Import an existing .env file into the vault
 */

import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import { importEnvFile, listProjects, getEnvFilePath } from '../services/envfile.js';
import { sync } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { makeImmutable } from '../services/protection.js';
import { 
  printBanner, 
  success, 
  error, 
  info,
  colors, 
  formatFileId 
} from '../utils/display.js';
import { 
  promptProject, 
  promptEnvironment, 
  getEncryptionOptions,
  confirm 
} from '../utils/prompts.js';

export async function importCommand(
  sourcePath: string,
  options: {
    project?: string;
    environment?: string;
    name?: string;
    description?: string;
  } = {}
): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  // Resolve and validate source path
  const resolvedPath = path.resolve(sourcePath);
  
  if (!(await fs.pathExists(resolvedPath))) {
    error(`File not found: ${resolvedPath}`);
    return;
  }
  
  // Read and preview the file
  const content = await fs.readFile(resolvedPath, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l && !l.startsWith('#'));
  
  console.log(colors.muted(`Importing: ${resolvedPath}`));
  console.log(colors.muted(`Variables: ${lines.length}`));
  console.log();
  
  // Preview first few variables
  const previewCount = Math.min(5, lines.length);
  console.log(colors.muted('Preview:'));
  
  for (let i = 0; i < previewCount; i++) {
    const line = lines[i];
    const [key] = line.split('=');
    console.log(colors.muted(`  ${key}=...`));
  }
  
  if (lines.length > previewCount) {
    console.log(colors.muted(`  ... and ${lines.length - previewCount} more`));
  }
  
  console.log();
  
  // Confirm import
  const proceed = await confirm('Import this file?', true);
  
  if (!proceed) {
    info('Import cancelled.');
    return;
  }
  
  // Get project
  const projects = await listProjects();
  const project = options.project || await promptProject(projects);
  
  // Get environment
  const environment = options.environment || await promptEnvironment();
  
  // Get encryption options
  const encryptionOptions = await getEncryptionOptions();
  
  // Import the file
  const spinner = ora('Importing env file...').start();
  
  try {
    const envFile = await importEnvFile(resolvedPath, project, environment, {
      name: options.name || path.basename(resolvedPath),
      description: options.description,
      encryptionOptions,
      immutable: config.immutableByDefault,
    });
    
    // Apply file protection if needed
    if (envFile.immutable) {
      const filePath = getEnvFilePath(envFile.id, envFile.encrypted);
      await makeImmutable(filePath);
    }
    
    spinner.succeed('File imported');
    
    // Sync to remote
    const syncSpinner = ora('Syncing to remote...').start();
    
    try {
      await sync();
      syncSpinner.succeed('Synced to remote');
    } catch {
      syncSpinner.warn('Could not sync to remote (will sync later)');
    }
    
    console.log();
    success('Environment file imported successfully!');
    console.log();
    console.log('  File ID: ' + formatFileId(envFile.id));
    console.log('  Variables: ' + lines.length);
    console.log('  Encrypted: ' + (envFile.encrypted ? colors.secondary('yes') : 'no'));
    console.log();
    
    // Ask about replacing original
    const replace = await confirm('Replace original file with a link to the vault?', false);
    
    if (replace) {
      const { createCopy } = await import('../services/linker.js');
      
      await createCopy(envFile.id, resolvedPath, encryptionOptions, true);
      success('Original file replaced with vault link');
    }
    
  } catch (err) {
    spinner.fail('Failed to import env file');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

