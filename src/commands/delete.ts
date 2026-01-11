/**
 * Delete Command
 * Delete an env file from the vault
 */

import ora from 'ora';
import { deleteEnvFile, listEnvFiles } from '../services/envfile.js';
import { sync } from '../services/git.js';
import { getConfig } from '../services/config.js';
import { getLinksForEnvFile, unlink } from '../services/linker.js';
import { 
  printBanner, 
  success, 
  error, 
  warning,
  colors, 
  formatFileId 
} from '../utils/display.js';
import { select, confirm } from '../utils/prompts.js';

export async function deleteCommand(fileId?: string): Promise<void> {
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
      error('No env files found.');
      return;
    }
    
    fileId = await select(
      'Select an env file to delete:',
      files.map(f => ({
        name: `${f.project}/${f.environment || 'default'}/${f.name}`,
        value: f.id,
      }))
    );
  }
  
  // Check for links
  const links = await getLinksForEnvFile(fileId);
  
  if (links.length > 0) {
    console.log(colors.muted(`This file has ${links.length} linked location(s):\n`));
    
    for (const link of links) {
      console.log(`  • ${link.targetPath}`);
    }
    
    console.log();
    warning('Deleting will also remove all linked files.');
  }
  
  // Confirm deletion
  const confirmed = await confirm(
    `Are you sure you want to delete ${formatFileId(fileId)}?`,
    false
  );
  
  if (!confirmed) {
    console.log();
    console.log('Deletion cancelled.');
    return;
  }
  
  const spinner = ora('Deleting env file...').start();
  
  try {
    // Remove all links first
    for (const link of links) {
      await unlink(link.targetPath);
    }
    
    // Delete the file
    await deleteEnvFile(fileId);
    
    spinner.succeed('Env file deleted');
    
    // Sync to remote
    const syncSpinner = ora('Syncing to remote...').start();
    
    try {
      await sync();
      syncSpinner.succeed('Synced');
    } catch {
      syncSpinner.warn('Could not sync (will sync later)');
    }
    
    console.log();
    success('File deleted successfully');
    
    if (links.length > 0) {
      console.log(colors.muted(`Removed ${links.length} linked location(s)`));
    }
    
  } catch (err) {
    spinner.fail('Failed to delete env file');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

