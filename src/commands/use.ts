/**
 * Use Command
 * Import/pull an env file into the current project directory
 */

import path from 'path';
import fs from 'fs-extra';
import ora from 'ora';
import inquirer from 'inquirer';
import { listEnvFiles, listProjects } from '../services/envfile.js';
import { createCopy, createSymlink } from '../services/linker.js';
import { getConfig } from '../services/config.js';
import { getManifest } from '../services/git.js';
import { 
  printBanner, 
  success, 
  error, 
  warning, 
  info,
  colors, 
  formatFileId 
} from '../utils/display.js';
import { getEncryptionOptions, select, confirm } from '../utils/prompts.js';
import type { EnvFile } from '../types/index.js';

export async function useCommand(
  fileId?: string,
  options: {
    output?: string;
    symlink?: boolean;
    force?: boolean;
  } = {}
): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const files = await listEnvFiles();
  
  if (files.length === 0) {
    error('No env files found in vault.');
    console.log();
    console.log('Add your first file: ' + colors.primary('envmatic add'));
    console.log('Or import one:       ' + colors.primary('envmatic import .env'));
    return;
  }
  
  // If no file ID provided, let user browse and select
  if (!fileId) {
    fileId = await browseAndSelect(files);
  }
  
  // Verify file exists
  const manifest = await getManifest();
  const metadata = manifest.files.find(f => f.id === fileId);
  
  if (!metadata) {
    error(`Env file not found: ${fileId}`);
    console.log();
    console.log('Available files:');
    for (const file of files.slice(0, 5)) {
      console.log(`  • ${file.id}`);
    }
    if (files.length > 5) {
      console.log(colors.muted(`  ... and ${files.length - 5} more`));
    }
    return;
  }
  
  // Determine output path
  const cwd = process.cwd();
  let outputPath = options.output || '.env';
  
  // Make path absolute if relative
  if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(cwd, outputPath);
  }
  
  // Check if file already exists
  if (await fs.pathExists(outputPath)) {
    if (!options.force) {
      const overwrite = await confirm(
        `${path.basename(outputPath)} already exists. Overwrite?`,
        false
      );
      
      if (!overwrite) {
        info('Cancelled.');
        return;
      }
    }
    
    // Backup existing file
    const backupPath = outputPath + '.backup';
    await fs.copy(outputPath, backupPath);
    info(`Backed up existing file to ${path.basename(backupPath)}`);
  }
  
  // Determine method: symlink or copy
  // Encrypted files must use copy
  let useSymlink = options.symlink ?? false;
  
  if (metadata.encrypted && useSymlink) {
    warning('Encrypted files cannot be symlinked. Using copy instead.');
    useSymlink = false;
  }
  
  // Get encryption options if needed
  const encryptionOptions = await getEncryptionOptions();
  
  const spinner = ora(
    useSymlink ? 'Creating symlink...' : 'Copying env file...'
  ).start();
  
  try {
    if (useSymlink) {
      await createSymlink(fileId, outputPath, encryptionOptions);
    } else {
      await createCopy(fileId, outputPath, encryptionOptions, true);
    }
    
    spinner.succeed(useSymlink ? 'Symlink created' : 'Env file copied');
    
    console.log();
    success('Environment ready!');
    console.log();
    console.log('  Source: ' + formatFileId(fileId));
    console.log('  Output: ' + colors.secondary(path.relative(cwd, outputPath) || outputPath));
    console.log('  Type:   ' + (useSymlink ? 'symlink' : 'copy'));
    
    if (!useSymlink) {
      console.log();
      info('This is a decrypted copy. Run `envmatic sync-links` to update it.');
    }
    
    // Show next steps
    console.log();
    console.log(colors.muted('Your app can now use the environment variables.'));
    
  } catch (err) {
    spinner.fail('Failed to import env file');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
    
    if (errorMessage.includes('Developer Mode')) {
      console.log();
      info('Tip: Symlinks on Windows require Developer Mode.');
      info('The file was copied instead of symlinked.');
    }
  }
}

/**
 * Interactive browser to select an env file
 */
async function browseAndSelect(files: EnvFile[]): Promise<string> {
  // Group files by project
  const projects = [...new Set(files.map(f => f.project))].sort();
  
  // Ask for project first
  const { project } = await inquirer.prompt([
    {
      type: 'list',
      name: 'project',
      message: 'Select project:',
      choices: projects.map(p => {
        const count = files.filter(f => f.project === p).length;
        return {
          name: `${p} ${colors.muted(`(${count} file${count > 1 ? 's' : ''})`)}`,
          value: p,
        };
      }),
    },
  ]);
  
  // Get files for selected project
  const projectFiles = files.filter(f => f.project === project);
  
  // If only one file, use it directly
  if (projectFiles.length === 1) {
    return projectFiles[0].id;
  }
  
  // Ask for specific file
  const { fileId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'fileId',
      message: 'Select environment:',
      choices: projectFiles.map(f => {
        const envLabel = f.environment || 'default';
        const flags = [];
        if (f.encrypted) flags.push('🔒');
        if (f.immutable) flags.push('📌');
        const flagStr = flags.length > 0 ? ' ' + flags.join(' ') : '';
        
        return {
          name: `${envLabel}/${f.name}${flagStr}`,
          value: f.id,
        };
      }),
    },
  ]);
  
  return fileId;
}

/**
 * Quick use: detect project and suggest matching env
 */
export async function pullCommand(options: {
  env?: string;
  output?: string;
  symlink?: boolean;
  force?: boolean;
} = {}): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  
  console.log(colors.muted(`Current directory: ${cwd}`));
  console.log(colors.muted(`Detected project: ${projectName}`));
  console.log();
  
  // Try to find matching project in vault
  const files = await listEnvFiles();
  const matchingFiles = files.filter(f => 
    f.project.toLowerCase() === projectName.toLowerCase()
  );
  
  if (matchingFiles.length === 0) {
    // No exact match, show all options
    info(`No files found for project "${projectName}".`);
    console.log();
    
    if (files.length === 0) {
      error('No env files in vault.');
      return;
    }
    
    // Fall back to full selection
    const fileId = await browseAndSelect(files);
    await useCommand(fileId, options);
    return;
  }
  
  // Found matching project
  success(`Found ${matchingFiles.length} env file(s) for ${projectName}`);
  console.log();
  
  let selectedFile: EnvFile;
  
  if (matchingFiles.length === 1) {
    selectedFile = matchingFiles[0];
  } else {
    // Multiple environments - let user choose
    const envChoices = matchingFiles.map(f => ({
      name: `${f.environment || 'default'}/${f.name}`,
      value: f,
    }));
    
    // If --env flag provided, try to match
    if (options.env) {
      const match = matchingFiles.find(f => 
        f.environment?.toLowerCase() === options.env?.toLowerCase()
      );
      
      if (match) {
        selectedFile = match;
      } else {
        error(`Environment "${options.env}" not found for ${projectName}`);
        console.log('Available: ' + matchingFiles.map(f => f.environment || 'default').join(', '));
        return;
      }
    } else {
      const { file } = await inquirer.prompt([
        {
          type: 'list',
          name: 'file',
          message: 'Select environment:',
          choices: envChoices,
        },
      ]);
      selectedFile = file;
    }
  }
  
  // Use the selected file
  await useCommand(selectedFile.id, {
    output: options.output,
    symlink: options.symlink,
    force: options.force,
  });
}

