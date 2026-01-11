/**
 * Sync Command
 * Synchronize vault with remote repository
 */

import ora from 'ora';
import { sync, getStatus, pull, push, commitChanges } from '../services/git.js';
import { syncCopies, listLinks } from '../services/linker.js';
import { listEnvFiles } from '../services/envfile.js';
import { getConfig } from '../services/config.js';
import { 
  printBanner, 
  success, 
  error, 
  info, 
  warning,
  colors 
} from '../utils/display.js';
import { getEncryptionOptions } from '../utils/prompts.js';

export async function syncCommand(options: {
  push?: boolean;
  pull?: boolean;
}): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  // Get current status
  const statusSpinner = ora('Checking status...').start();
  const status = await getStatus();
  statusSpinner.stop();
  
  console.log(colors.muted('Branch:') + ' ' + status.branch);
  
  if (status.ahead > 0 || status.behind > 0) {
    console.log(
      colors.muted('Status:') + ' ' +
      (status.ahead > 0 ? colors.secondary(`${status.ahead} ahead`) : '') +
      (status.ahead > 0 && status.behind > 0 ? ', ' : '') +
      (status.behind > 0 ? colors.accent(`${status.behind} behind`) : '')
    );
  }
  
  if (status.modified > 0) {
    console.log(colors.muted('Modified:') + ' ' + colors.accent(String(status.modified)));
  }
  
  console.log();
  
  // Perform sync
  const syncSpinner = ora('Syncing with remote...').start();
  
  try {
    if (options.pull && !options.push) {
      await pull();
      syncSpinner.succeed('Pulled latest changes');
    } else if (options.push && !options.pull) {
      if (status.modified > 0) {
        await commitChanges('Manual sync from envmatic');
      }
      await push();
      syncSpinner.succeed('Pushed local changes');
    } else {
      // Full sync (commit + pull + push)
      const result = await sync();
      
      // Build status message
      const actions: string[] = [];
      if (result.committed) actions.push('committed');
      if (result.pulled) actions.push('pulled');
      if (result.pushed) actions.push('pushed');
      
      if (actions.length > 0) {
        syncSpinner.succeed(`Synced (${actions.join(', ')})`);
      } else {
        syncSpinner.succeed('Already in sync');
      }
    }
    
    console.log();
    success('Vault synchronized');
    
  } catch (err) {
    syncSpinner.fail('Sync failed');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

export async function syncLinksCommand(): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const links = await listLinks();
  const copies = links.filter(l => l.type === 'copy');
  
  if (copies.length === 0) {
    info('No copied files to sync.');
    console.log();
    console.log(colors.muted('Note: Symlinks are automatically in sync.'));
    return;
  }
  
  console.log(colors.muted(`Found ${copies.length} copy(ies) to sync\n`));
  
  const encryptionOptions = await getEncryptionOptions();
  
  // Group by source
  const bySource: Record<string, typeof copies> = {};
  for (const copy of copies) {
    if (!bySource[copy.sourceId]) {
      bySource[copy.sourceId] = [];
    }
    bySource[copy.sourceId].push(copy);
  }
  
  let totalSynced = 0;
  
  for (const [sourceId, sourceCopies] of Object.entries(bySource)) {
    const spinner = ora(`Syncing ${sourceId}...`).start();
    
    try {
      const synced = await syncCopies(sourceId, encryptionOptions);
      totalSynced += synced;
      spinner.succeed(`Synced ${synced} copy(ies) from ${sourceId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      spinner.fail(`Failed to sync ${sourceId}: ${errorMessage}`);
    }
  }
  
  console.log();
  
  if (totalSynced > 0) {
    success(`Synced ${totalSynced} file(s)`);
  } else {
    info('No files were updated');
  }
}

export async function statusCommand(options: { json?: boolean } = {}): Promise<void> {
  if (!options.json) {
    printBanner();
  }
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const status = await getStatus();
  const files = await listEnvFiles();
  const links = await listLinks();
  
  const statusData = {
    config: {
      repoUrl: config.repoUrl,
      encryptionEnabled: config.encryptionEnabled,
      encryptionMethod: config.encryptionMethod,
      immutableByDefault: config.immutableByDefault,
    },
    git: status,
    stats: {
      files: files.length,
      projects: [...new Set(files.map(f => f.project))].length,
      links: links.length,
      encryptedFiles: files.filter(f => f.encrypted).length,
    },
  };
  
  if (options.json) {
    console.log(JSON.stringify(statusData, null, 2));
    return;
  }
  
  console.log(colors.muted('Repository:') + ' ' + config.repoUrl);
  console.log(colors.muted('Branch:    ') + ' ' + status.branch);
  console.log();
  
  console.log(colors.muted('Settings:'));
  console.log('  Encryption: ' + (config.encryptionEnabled 
    ? colors.secondary(`${config.encryptionMethod}`) 
    : colors.muted('disabled')));
  console.log('  Immutable:  ' + (config.immutableByDefault 
    ? colors.secondary('yes') 
    : 'no'));
  console.log();
  
  console.log(colors.muted('Statistics:'));
  console.log('  Files:    ' + files.length);
  console.log('  Projects: ' + [...new Set(files.map(f => f.project))].length);
  console.log('  Links:    ' + links.length);
  console.log('  Encrypted:' + files.filter(f => f.encrypted).length);
  console.log();
  
  console.log(colors.muted('Git status:'));
  console.log('  Ahead:    ' + (status.ahead > 0 ? colors.secondary(String(status.ahead)) : '0'));
  console.log('  Behind:   ' + (status.behind > 0 ? colors.accent(String(status.behind)) : '0'));
  console.log('  Modified: ' + (status.modified > 0 ? colors.accent(String(status.modified)) : '0'));
}

