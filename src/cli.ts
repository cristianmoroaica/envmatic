#!/usr/bin/env node

/**
 * Envmatic CLI
 * Cross-platform dotfile and secret manager
 */

import { Command } from 'commander';
import { VERSION, BRAND } from './constants.js';

// Import commands
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { linkCommand, copyCommand, unlinkCommand, listLinksCommand } from './commands/link.js';
import { syncCommand, syncLinksCommand, statusCommand } from './commands/sync.js';
import { importCommand } from './commands/import.js';
import { editCommand, setCommand, unsetCommand } from './commands/edit.js';
import { deleteCommand } from './commands/delete.js';
import { useCommand, pullCommand } from './commands/use.js';
import { changePasswordCommand, rotateKeyCommand } from './commands/rotate.js';
import { lockCommand } from './commands/lock.js';

const program = new Command();

program
  .name('envmatic')
  .description(`${BRAND.prefix} ${BRAND.name} - ${BRAND.tagline}`)
  .version(VERSION);

// ============================================================================
// SETUP COMMANDS
// ============================================================================

program
  .command('init')
  .description('Initialize Envmatic with a Git repository')
  .option('-f, --force', 'Force re-initialization')
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command('status')
  .description('Show current status and configuration')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await statusCommand(options);
  });

program
  .command('change-password')
  .description('Change your encryption password')
  .action(async () => {
    await changePasswordCommand();
  });

program
  .command('rotate-key')
  .description('Rotate encryption key or change encryption method')
  .action(async () => {
    await rotateKeyCommand();
  });

// ============================================================================
// FILE MANAGEMENT COMMANDS
// ============================================================================

program
  .command('add')
  .description('Add a new env file to the vault')
  .option('-p, --project <name>', 'Project name')
  .option('-e, --environment <name>', 'Environment name')
  .option('-n, --name <name>', 'File name (default: .env)')
  .option('-d, --description <text>', 'Description')
  .action(async (options) => {
    await addCommand(options);
  });

program
  .command('import <path>')
  .description('Import an existing .env file into the vault')
  .option('-p, --project <name>', 'Project name')
  .option('-e, --environment <name>', 'Environment name')
  .option('-n, --name <name>', 'File name')
  .option('-d, --description <text>', 'Description')
  .action(async (path, options) => {
    await importCommand(path, options);
  });

program
  .command('list')
  .alias('ls')
  .description('List all env files in the vault')
  .option('-p, --project <name>', 'Filter by project')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await listCommand(options);
  });

program
  .command('show [file-id]')
  .alias('get')
  .description('Display contents of an env file')
  .option('-r, --reveal', 'Reveal full values (not masked)')
  .option('--json', 'Output as JSON')
  .action(async (fileId, options) => {
    await showCommand(fileId, options);
  });

program
  .command('edit [file-id]')
  .description('Interactively edit an env file')
  .option('-e, --editor', 'Open in external editor (vim, VS Code, etc.)')
  .action(async (fileId, options) => {
    await editCommand(fileId, options);
  });

program
  .command('set <file-id> <key> <value>')
  .description('Set a variable in an env file')
  .action(async (fileId, key, value) => {
    await setCommand(fileId, key, value);
  });

program
  .command('unset <file-id> <key>')
  .description('Remove a variable from an env file')
  .action(async (fileId, key) => {
    await unsetCommand(fileId, key);
  });

program
  .command('delete [file-id]')
  .alias('rm')
  .description('Delete an env file from the vault')
  .action(async (fileId) => {
    await deleteCommand(fileId);
  });

program
  .command('lock [file-id]')
  .description('Lock (protect) env files after editing')
  .option('-a, --all', 'Lock all unlocked files')
  .action(async (fileId, options) => {
    await lockCommand(fileId, options);
  });

// ============================================================================
// USE/PULL COMMANDS (import env to current project)
// ============================================================================

program
  .command('use [file-id]')
  .description('Import an env file into the current project')
  .option('-o, --output <path>', 'Output file path (default: .env)')
  .option('-s, --symlink', 'Create symlink instead of copy')
  .option('-f, --force', 'Overwrite without confirmation')
  .action(async (fileId, options) => {
    await useCommand(fileId, options);
  });

program
  .command('pull')
  .description('Auto-detect project and pull matching env file')
  .option('-e, --env <name>', 'Environment name (development, production, etc.)')
  .option('-o, --output <path>', 'Output file path (default: .env)')
  .option('-s, --symlink', 'Create symlink instead of copy')
  .option('-f, --force', 'Overwrite without confirmation')
  .action(async (options) => {
    await pullCommand(options);
  });

// ============================================================================
// LINK COMMANDS
// ============================================================================

program
  .command('link [file-id] [target]')
  .description('Create a symlink to an env file')
  .option('-c, --copy', 'Create a copy instead of symlink')
  .option('-a, --auto-sync', 'Auto-sync copies on changes')
  .action(async (fileId, target, options) => {
    await linkCommand(fileId, target, options);
  });

program
  .command('copy [file-id] [target]')
  .description('Create a decrypted copy of an env file')
  .option('-a, --auto-sync', 'Auto-sync on changes')
  .action(async (fileId, target, options) => {
    await copyCommand(fileId, target, options);
  });

program
  .command('unlink [target]')
  .description('Remove a linked file')
  .action(async (target) => {
    await unlinkCommand(target);
  });

program
  .command('links')
  .description('List all linked files')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await listLinksCommand(options);
  });

// ============================================================================
// SYNC COMMANDS
// ============================================================================

program
  .command('sync')
  .description('Sync vault with remote repository')
  .option('--push', 'Push only')
  .option('--pull', 'Pull only')
  .action(async (options) => {
    await syncCommand(options);
  });

program
  .command('sync-links')
  .description('Update all copied files from vault')
  .action(async () => {
    await syncLinksCommand();
  });

// ============================================================================
// RUN
// ============================================================================

program.parse();

