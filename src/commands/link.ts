/**
 * Link Command
 * Create symlink or copy of env file to target path
 */

import path from 'path';
import ora from 'ora';
import { listEnvFiles } from '../services/envfile.js';
import { createSymlink, createCopy, listLinks, unlink } from '../services/linker.js';
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

export async function linkCommand(
  fileId?: string,
  targetPath?: string,
  options: {
    copy?: boolean;
    autoSync?: boolean;
  } = {}
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
      'Select an env file to link:',
      files.map(f => ({
        name: `${f.project}/${f.environment || 'default'}/${f.name}`,
        value: f.id,
      }))
    );
  }
  
  // Verify file exists
  const manifest = await getManifest();
  const metadata = manifest.files.find(f => f.id === fileId);
  
  if (!metadata) {
    error(`Env file not found: ${fileId}`);
    return;
  }
  
  // Get target path
  if (!targetPath) {
    const { target } = await (await import('inquirer')).default.prompt([
      {
        type: 'input',
        name: 'target',
        message: 'Target path (e.g., ./.env):',
        default: './.env',
      },
    ]);
    targetPath = target;
  }
  
  const resolvedTarget = path.resolve(targetPath!);
  
  // Check if encrypted file - must use copy
  if (metadata.encrypted && !options.copy) {
    warning('Encrypted files cannot be symlinked. Using copy mode instead.');
    options.copy = true;
  }
  
  const encryptionOptions = await getEncryptionOptions();
  
  const spinner = ora(
    options.copy ? 'Creating copy...' : 'Creating symlink...'
  ).start();
  
  try {
    let link;
    
    if (options.copy) {
      link = await createCopy(
        fileId, 
        resolvedTarget, 
        encryptionOptions,
        options.autoSync ?? false
      );
    } else {
      link = await createSymlink(fileId, resolvedTarget, encryptionOptions);
    }
    
    spinner.succeed(options.copy ? 'Copy created' : 'Symlink created');
    
    console.log();
    success(`Linked ${formatFileId(fileId)}`);
    console.log();
    console.log('  Target: ' + colors.secondary(resolvedTarget));
    console.log('  Type:   ' + (link.type === 'symlink' ? 'symlink' : 'copy'));
    
    if (link.type === 'copy') {
      console.log('  Sync:   ' + (link.autoSync ? 'auto' : 'manual'));
      console.log();
      info('This is a copy. Run `envmatic sync-links` to update it.');
    } else {
      console.log();
      info('This is a symlink. Changes to source will be reflected automatically.');
    }
    
  } catch (err) {
    spinner.fail('Failed to create link');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
    
    if (errorMessage.includes('Developer Mode')) {
      console.log();
      info('Alternative: Use --copy flag to create a copy instead of symlink.');
    }
  }
}

export async function copyCommand(
  fileId?: string,
  targetPath?: string,
  options: { autoSync?: boolean } = {}
): Promise<void> {
  return linkCommand(fileId, targetPath, { ...options, copy: true });
}

export async function unlinkCommand(targetPath?: string): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  // If no target provided, show list and let user select
  if (!targetPath) {
    const links = await listLinks();
    
    if (links.length === 0) {
      info('No linked files found.');
      return;
    }
    
    targetPath = await select(
      'Select a link to remove:',
      links.map(l => ({
        name: `${l.targetPath} (${l.type})`,
        value: l.targetPath,
      }))
    );
  }
  
  const confirmed = await confirm(`Remove link at ${targetPath}?`);
  
  if (!confirmed) {
    info('Cancelled.');
    return;
  }
  
  const removed = await unlink(targetPath);
  
  if (removed) {
    success('Link removed');
  } else {
    warning('Link not found in registry');
  }
}

export async function listLinksCommand(options: { json?: boolean } = {}): Promise<void> {
  if (!options.json) {
    printBanner();
  }
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const links = await listLinks();
  
  if (options.json) {
    console.log(JSON.stringify(links, null, 2));
    return;
  }
  
  if (links.length === 0) {
    info('No linked files found.');
    console.log();
    console.log('Create a link: ' + colors.primary('envmatic link <file-id> <target>'));
    return;
  }
  
  console.log(colors.muted(`Found ${links.length} link(s)\n`));
  
  for (const link of links) {
    const typeIcon = link.type === 'symlink' ? '🔗' : '📄';
    const syncIcon = link.autoSync ? '🔄' : '';
    
    console.log(`${typeIcon} ${colors.secondary(link.targetPath)} ${syncIcon}`);
    console.log(colors.muted(`   └─ ${link.sourceId}`));
    console.log();
  }
}

