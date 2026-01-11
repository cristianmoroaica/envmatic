/**
 * Rotate Command
 * Change encryption password or rotate encryption key/method
 */

import ora from 'ora';
import inquirer from 'inquirer';
import { 
  readEnvFile, 
  updateEnvFile, 
  listEnvFiles,
  getEnvFilePath
} from '../services/envfile.js';
import { sync } from '../services/git.js';
import { getConfig, updateConfig } from '../services/config.js';
import { verifyEncryption, validateSSHKey } from '../services/encryption.js';
import { makeMutable, makeImmutable } from '../services/protection.js';
import { 
  printBanner, 
  success, 
  error, 
  info,
  warning,
  colors
} from '../utils/display.js';
import { promptPassword } from '../utils/prompts.js';
import type { EncryptionOptions } from '../types/index.js';

/**
 * Change password command
 * Requires old password to decrypt, then re-encrypts with new password
 */
export async function changePasswordCommand(): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  if (!config.encryptionEnabled) {
    error('Encryption is not enabled. Nothing to change.');
    info('Run `envmatic rotate-key` to enable encryption.');
    return;
  }
  
  if (config.encryptionMethod !== 'password') {
    error('Current encryption method is SSH key, not password.');
    info('Use `envmatic rotate-key` to switch encryption methods.');
    return;
  }
  
  console.log(colors.muted('Change your encryption password.\n'));
  warning('You will need to enter your current password to proceed.');
  console.log();
  
  // Get old password
  const { oldPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'oldPassword',
      message: 'Enter your CURRENT password:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 8) {
          return 'Password must be at least 8 characters';
        }
        return true;
      },
    },
  ]);
  
  // Verify old password works
  const oldOptions: EncryptionOptions = {
    method: 'password',
    password: oldPassword,
  };
  
  const verifySpinner = ora('Verifying current password...').start();
  const isValid = await verifyEncryption(oldOptions);
  
  if (!isValid) {
    verifySpinner.fail('Current password is incorrect');
    error('Cannot proceed without the correct current password.');
    return;
  }
  
  verifySpinner.succeed('Current password verified');
  
  // Get new password
  console.log();
  const { newPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'newPassword',
      message: 'Enter your NEW password:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 8) {
          return 'Password must be at least 8 characters';
        }
        if (input === oldPassword) {
          return 'New password must be different from current password';
        }
        return true;
      },
    },
  ]);
  
  // Confirm new password
  const { confirmPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm your NEW password:',
      mask: '*',
      validate: (input: string) => {
        if (input !== newPassword) {
          return 'Passwords do not match';
        }
        return true;
      },
    },
  ]);
  
  const newOptions: EncryptionOptions = {
    method: 'password',
    password: newPassword,
  };
  
  // Get all encrypted files
  const files = await listEnvFiles();
  const encryptedFiles = files.filter(f => f.encrypted);
  
  if (encryptedFiles.length === 0) {
    info('No encrypted files found. Password updated for future files.');
    success('Password changed successfully!');
    return;
  }
  
  console.log();
  console.log(colors.muted(`Found ${encryptedFiles.length} encrypted file(s) to re-encrypt.\n`));
  
  // Re-encrypt all files
  const spinner = ora('Re-encrypting files...').start();
  let processed = 0;
  let errors = 0;
  
  for (const file of encryptedFiles) {
    try {
      // Make file mutable if needed
      const filePath = getEnvFilePath(file.id, file.encrypted);
      if (file.immutable) {
        await makeMutable(filePath);
      }
      
      // Read with old password
      const { variables } = await readEnvFile(file.id, oldOptions);
      
      // Write with new password
      await updateEnvFile(file.id, variables, newOptions);
      
      // Restore protection if needed
      if (file.immutable) {
        await makeImmutable(filePath);
      }
      
      processed++;
      spinner.text = `Re-encrypting files... (${processed}/${encryptedFiles.length})`;
    } catch (err) {
      errors++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`\nFailed to re-encrypt ${file.id}: ${errorMessage}`);
    }
  }
  
  if (errors > 0) {
    spinner.warn(`Re-encrypted ${processed} files with ${errors} error(s)`);
  } else {
    spinner.succeed(`Re-encrypted ${processed} file(s)`);
  }
  
  // Sync to remote
  const syncSpinner = ora('Syncing to remote...').start();
  
  try {
    await sync();
    syncSpinner.succeed('Synced to remote');
  } catch {
    syncSpinner.warn('Could not sync to remote (will sync later)');
  }
  
  console.log();
  success('Password changed successfully!');
  console.log();
  warning('Remember your new password! It cannot be recovered.');
  warning('If you forget it, all encrypted data will be permanently lost.');
}

/**
 * Rotate encryption key/method
 * Can switch between password and SSH key encryption
 */
export async function rotateKeyCommand(): Promise<void> {
  printBanner();
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  console.log(colors.muted('Rotate your encryption key or change encryption method.\n'));
  
  // Determine current state
  const currentMethod = config.encryptionEnabled 
    ? config.encryptionMethod || 'none'
    : 'none';
  
  console.log(colors.muted('Current encryption:') + ' ' + 
    (currentMethod === 'none' 
      ? colors.warning('disabled') 
      : colors.secondary(currentMethod)));
  console.log();
  
  // Get current encryption options if encryption is enabled
  let oldOptions: EncryptionOptions | undefined;
  
  if (config.encryptionEnabled && config.encryptionMethod) {
    warning('You will need to provide your current credentials to proceed.');
    console.log();
    
    if (config.encryptionMethod === 'password') {
      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter your CURRENT password:',
          mask: '*',
        },
      ]);
      
      oldOptions = { method: 'password', password };
      
      // Verify
      const isValid = await verifyEncryption(oldOptions);
      if (!isValid) {
        error('Current password is incorrect. Cannot proceed.');
        return;
      }
      success('Current password verified');
    } else if (config.encryptionMethod === 'ssh') {
      oldOptions = { 
        method: 'ssh', 
        sshKeyPath: config.sshKeyPath! 
      };
      
      // Verify SSH key exists
      const isValid = await validateSSHKey(config.sshKeyPath!);
      if (!isValid) {
        error('Current SSH key is not accessible. Cannot proceed.');
        return;
      }
      success('Current SSH key verified');
    }
  }
  
  console.log();
  
  // Ask for new method
  const { newMethod } = await inquirer.prompt([
    {
      type: 'list',
      name: 'newMethod',
      message: 'Select new encryption method:',
      choices: [
        { name: 'Password encryption', value: 'password' },
        { name: 'SSH key encryption', value: 'ssh' },
        { name: 'Disable encryption (not recommended)', value: 'none' },
      ],
    },
  ]);
  
  let newOptions: EncryptionOptions | undefined;
  let newSshKeyPath: string | undefined;
  
  if (newMethod === 'password') {
    // Show password warning
    console.log();
    console.log(colors.error('╔══════════════════════════════════════════════════════════════╗'));
    console.log(colors.error('║') + colors.warning('  ⚠️  PASSWORD SECURITY WARNING                                ') + colors.error('║'));
    console.log(colors.error('╠══════════════════════════════════════════════════════════════╣'));
    console.log(colors.error('║') + '  Your password is the ONLY way to decrypt your secrets.      ' + colors.error('║'));
    console.log(colors.error('║') + '  There is NO password recovery mechanism.                    ' + colors.error('║'));
    console.log(colors.error('║') + '                                                              ' + colors.error('║'));
    console.log(colors.error('║') + colors.warning('  If you forget your password:                                 ') + colors.error('║'));
    console.log(colors.error('║') + colors.error('  → All encrypted data will be PERMANENTLY LOST               ') + colors.error('║'));
    console.log(colors.error('║') + colors.error('  → There is NO way to recover your secrets                   ') + colors.error('║'));
    console.log(colors.error('║') + '                                                              ' + colors.error('║'));
    console.log(colors.error('║') + '  We strongly recommend:                                      ' + colors.error('║'));
    console.log(colors.error('║') + '  • Using a password manager to store your password           ' + colors.error('║'));
    console.log(colors.error('║') + '  • Writing it down and storing it securely offline           ' + colors.error('║'));
    console.log(colors.error('╚══════════════════════════════════════════════════════════════╝'));
    console.log();
    
    const { understood } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'understood',
        message: 'I understand that forgetting my password means losing all encrypted data',
        default: false,
      },
    ]);
    
    if (!understood) {
      info('Operation cancelled.');
      return;
    }
    
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter your NEW password:',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.length < 8) {
            return 'Password must be at least 8 characters';
          }
          return true;
        },
      },
    ]);
    
    const { confirmPwd } = await inquirer.prompt([
      {
        type: 'password',
        name: 'confirmPwd',
        message: 'Confirm your NEW password:',
        mask: '*',
        validate: (input: string) => {
          if (input !== password) {
            return 'Passwords do not match';
          }
          return true;
        },
      },
    ]);
    
    newOptions = { method: 'password', password };
    
  } else if (newMethod === 'ssh') {
    const { keyPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'keyPath',
        message: 'Path to SSH private key:',
        default: '~/.ssh/id_rsa',
      },
    ]);
    
    newSshKeyPath = keyPath.replace(/^~/, process.env.HOME || '');
    
    const validKey = await validateSSHKey(newSshKeyPath!);
    if (!validKey) {
      error('Invalid SSH key file. Please check the path and try again.');
      return;
    }
    
    success('SSH key validated');
    newOptions = { method: 'ssh', sshKeyPath: newSshKeyPath };
    
  } else {
    // Disabling encryption
    warning('Disabling encryption will store all files in PLAIN TEXT.');
    warning('Anyone with access to the repository will be able to read your secrets.');
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to disable encryption?',
        default: false,
      },
    ]);
    
    if (!confirm) {
      info('Operation cancelled.');
      return;
    }
  }
  
  // Get all files
  const files = await listEnvFiles();
  const encryptedFiles = files.filter(f => f.encrypted);
  
  console.log();
  
  if (encryptedFiles.length === 0) {
    // No files to re-encrypt, just update config
    await updateConfig({
      encryptionEnabled: newMethod !== 'none',
      encryptionMethod: newMethod === 'none' ? undefined : newMethod,
      sshKeyPath: newSshKeyPath,
    });
    
    success('Encryption settings updated!');
    info('New settings will apply to future files.');
    return;
  }
  
  console.log(colors.muted(`Found ${encryptedFiles.length} encrypted file(s) to process.\n`));
  
  // Re-encrypt all files
  const spinner = ora('Processing files...').start();
  let processed = 0;
  let errors = 0;
  
  for (const file of encryptedFiles) {
    try {
      const filePath = getEnvFilePath(file.id, file.encrypted);
      
      // Make file mutable if needed
      if (file.immutable) {
        await makeMutable(filePath);
      }
      
      // Read with old options
      const { variables } = await readEnvFile(file.id, oldOptions);
      
      // Write with new options (or no encryption if disabling)
      await updateEnvFile(file.id, variables, newOptions);
      
      // Restore protection if needed
      if (file.immutable) {
        // File path might have changed (added/removed .enc extension)
        const newFilePath = getEnvFilePath(file.id, newMethod !== 'none');
        await makeImmutable(newFilePath);
      }
      
      processed++;
      spinner.text = `Processing files... (${processed}/${encryptedFiles.length})`;
    } catch (err) {
      errors++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`\nFailed to process ${file.id}: ${errorMessage}`);
    }
  }
  
  if (errors > 0) {
    spinner.warn(`Processed ${processed} files with ${errors} error(s)`);
  } else {
    spinner.succeed(`Processed ${processed} file(s)`);
  }
  
  // Update config
  await updateConfig({
    encryptionEnabled: newMethod !== 'none',
    encryptionMethod: newMethod === 'none' ? undefined : newMethod,
    sshKeyPath: newSshKeyPath,
  });
  
  // Sync to remote
  const syncSpinner = ora('Syncing to remote...').start();
  
  try {
    await sync();
    syncSpinner.succeed('Synced to remote');
  } catch {
    syncSpinner.warn('Could not sync to remote (will sync later)');
  }
  
  console.log();
  success('Encryption key rotated successfully!');
  
  if (newMethod === 'password') {
    console.log();
    warning('Remember your password! It cannot be recovered.');
    warning('If you forget it, all encrypted data will be permanently lost.');
  }
}

