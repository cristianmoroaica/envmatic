/**
 * Init Command
 * Initialize Envmatic with a Git repository
 */

import ora from 'ora';
import inquirer from 'inquirer';
import { 
  isConfigured, 
  saveConfig, 
  createInitialConfig,
  ensureEnvmaticHome 
} from '../services/config.js';
import { 
  cloneRepository, 
  initRepository, 
  isVaultInitialized,
  checkRemoteAccess 
} from '../services/git.js';
import { verifyEncryption, validateSSHKey } from '../services/encryption.js';
import { printBanner, success, error, info, warning, colors } from '../utils/display.js';
import { DEFAULT_BRANCH } from '../constants.js';

export async function initCommand(options: { force?: boolean }): Promise<void> {
  printBanner();
  
  // Check if already configured
  if (await isConfigured() && !options.force) {
    error('Envmatic is already initialized.');
    info('Use --force to reinitialize (this will overwrite current settings).');
    return;
  }
  
  console.log('Let\'s set up your secure environment vault.\n');
  
  // Get repository URL
  const { repoUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoUrl',
      message: 'Enter your private Git repository URL:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Repository URL is required';
        }
        if (!input.includes('git') && !input.includes('github') && !input.includes('gitlab') && !input.includes('bitbucket')) {
          return 'Please enter a valid Git repository URL';
        }
        return true;
      },
    },
  ]);
  
  // Check repository access
  const accessSpinner = ora('Checking repository access...').start();
  
  const hasAccess = await checkRemoteAccess(repoUrl);
  
  if (!hasAccess) {
    accessSpinner.fail('Cannot access repository');
    console.log();
    warning('Make sure you have:');
    console.log('  • Created the repository');
    console.log('  • Configured SSH keys or credentials');
    console.log('  • Have push access to the repository');
    console.log();
    info('Tip: Test with: git ls-remote ' + repoUrl);
    return;
  }
  
  accessSpinner.succeed('Repository is accessible');
  
  // Ask about encryption
  const { enableEncryption } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableEncryption',
      message: 'Enable encryption for extra security?',
      default: true,
    },
  ]);
  
  let encryptionMethod: 'password' | 'ssh' | undefined;
  let sshKeyPath: string | undefined;
  let password: string | undefined;
  
  if (enableEncryption) {
    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'Choose encryption method:',
        choices: [
          { name: 'Password (you\'ll be prompted when accessing secrets)', value: 'password' },
          { name: 'SSH Key (uses your existing SSH key for encryption)', value: 'ssh' },
        ],
      },
    ]);
    
    encryptionMethod = method;
    
    if (method === 'password') {
      // Show password security warning
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
      console.log(colors.error('║') + '  • Consider using SSH key encryption instead                 ' + colors.error('║'));
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
        info('Setup cancelled. Consider using SSH key encryption instead.');
        return;
      }
    }
    
    if (method === 'ssh') {
      const { keyPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'keyPath',
          message: 'Path to SSH private key:',
          default: '~/.ssh/id_rsa',
        },
      ]);
      
      sshKeyPath = keyPath.replace(/^~/, process.env.HOME || '');
      
      const validKey = await validateSSHKey(sshKeyPath!);
      if (!validKey) {
        error('Invalid SSH key file. Please check the path and try again.');
        return;
      }
      
      success('SSH key validated');
    } else {
      // Password method
      const { pwd } = await inquirer.prompt([
        {
          type: 'password',
          name: 'pwd',
          message: 'Create an encryption password:',
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
          message: 'Confirm password:',
          mask: '*',
          validate: (input: string) => {
            if (input !== pwd) {
              return 'Passwords do not match';
            }
            return true;
          },
        },
      ]);
      
      password = pwd;
    }
    
    // Verify encryption works
    const verifySpinner = ora('Verifying encryption...').start();
    
    const encryptionOptions = encryptionMethod === 'ssh' 
      ? { method: 'ssh' as const, sshKeyPath: sshKeyPath! }
      : { method: 'password' as const, password: password! };
    
    const verified = await verifyEncryption(encryptionOptions);
    
    if (!verified) {
      verifySpinner.fail('Encryption verification failed');
      return;
    }
    
    verifySpinner.succeed('Encryption verified');
  }
  
  // Ask about immutability
  const { immutableByDefault } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'immutableByDefault',
      message: 'Make files immutable by default (prevents accidental edits)?',
      default: true,
    },
  ]);
  
  // Initialize envmatic home
  await ensureEnvmaticHome();
  
  // Clone or init repository
  const repoSpinner = ora('Setting up vault...').start();
  
  try {
    if (await isVaultInitialized() && options.force) {
      // Clear existing vault
      const fs = await import('fs-extra');
      const { VAULT_PATH } = await import('../constants.js');
      await fs.remove(VAULT_PATH);
    }
    
    try {
      // Try to clone (repo has content)
      await cloneRepository(repoUrl, DEFAULT_BRANCH);
      repoSpinner.succeed('Vault cloned from repository');
    } catch {
      // Repository might be empty, initialize it
      await initRepository(repoUrl, DEFAULT_BRANCH);
      repoSpinner.succeed('Vault initialized (new repository)');
    }
  } catch (err) {
    repoSpinner.fail('Failed to set up vault');
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
    return;
  }
  
  // Save configuration
  const config = createInitialConfig(repoUrl, {
    encryptionEnabled: enableEncryption,
    encryptionMethod,
    sshKeyPath,
    immutableByDefault,
    branch: DEFAULT_BRANCH,
  });
  
  await saveConfig(config);
  
  console.log();
  success('Envmatic initialized successfully!');
  console.log();
  console.log(colors.muted('Next steps:'));
  console.log('  • Add your first env file: ' + colors.primary('envmatic add'));
  console.log('  • Import an existing .env: ' + colors.primary('envmatic import .env'));
  console.log('  • View all commands:       ' + colors.primary('envmatic --help'));
  console.log();
  
  if (enableEncryption && encryptionMethod === 'password') {
    console.log(colors.warning('┌─────────────────────────────────────────────────────┐'));
    console.log(colors.warning('│') + colors.error(' ⚠️  REMEMBER YOUR PASSWORD!                         ') + colors.warning('│'));
    console.log(colors.warning('│') + '  It cannot be recovered. If you forget it,          ' + colors.warning('│'));
    console.log(colors.warning('│') + '  all encrypted data will be permanently lost.       ' + colors.warning('│'));
    console.log(colors.warning('│') + '                                                     ' + colors.warning('│'));
    console.log(colors.warning('│') + '  To change your password later:                     ' + colors.warning('│'));
    console.log(colors.warning('│') + colors.primary('  envmatic change-password                          ') + colors.warning('│'));
    console.log(colors.warning('└─────────────────────────────────────────────────────┘'));
    console.log();
  }
}

