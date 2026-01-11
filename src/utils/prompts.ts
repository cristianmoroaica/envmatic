/**
 * Prompt Utilities
 * Interactive prompts for CLI
 */

import inquirer from 'inquirer';
import { getConfig } from '../services/config.js';
import { validateSSHKey } from '../services/encryption.js';
import type { EncryptionOptions } from '../types/index.js';

/**
 * Prompt for encryption password
 */
export async function promptPassword(confirm: boolean = false): Promise<string> {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter your encryption password:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 8) {
          return 'Password must be at least 8 characters';
        }
        return true;
      },
    },
  ]);
  
  if (confirm) {
    const { confirmPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm your password:',
        mask: '*',
        validate: (input: string) => {
          if (input !== password) {
            return 'Passwords do not match';
          }
          return true;
        },
      },
    ]);
  }
  
  return password;
}

/**
 * Prompt for SSH key path
 */
export async function promptSSHKey(): Promise<string> {
  const { sshKeyPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'sshKeyPath',
      message: 'Enter path to your SSH private key:',
      default: '~/.ssh/id_rsa',
      validate: async (input: string) => {
        const expanded = input.replace(/^~/, process.env.HOME || '');
        const valid = await validateSSHKey(expanded);
        if (!valid) {
          return 'Invalid SSH private key file';
        }
        return true;
      },
    },
  ]);
  
  return sshKeyPath.replace(/^~/, process.env.HOME || '');
}

/**
 * Get encryption options based on config and prompts
 */
export async function getEncryptionOptions(): Promise<EncryptionOptions | undefined> {
  const config = await getConfig();
  
  if (!config || !config.encryptionEnabled) {
    return undefined;
  }
  
  if (config.encryptionMethod === 'ssh' && config.sshKeyPath) {
    return {
      method: 'ssh',
      sshKeyPath: config.sshKeyPath,
    };
  }
  
  if (config.encryptionMethod === 'password') {
    const password = await promptPassword();
    return {
      method: 'password',
      password,
    };
  }
  
  return undefined;
}

/**
 * Prompt for project name
 */
export async function promptProject(existing?: string[]): Promise<string> {
  if (existing && existing.length > 0) {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Select or create a project:',
        choices: [
          ...existing.map(p => ({ name: p, value: p })),
          new inquirer.Separator(),
          { name: '+ Create new project', value: '__new__' },
        ],
      },
    ]);
    
    if (choice !== '__new__') {
      return choice;
    }
  }
  
  const { project } = await inquirer.prompt([
    {
      type: 'input',
      name: 'project',
      message: 'Enter project name:',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Project name is required';
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
          return 'Project name can only contain letters, numbers, dashes, and underscores';
        }
        return true;
      },
    },
  ]);
  
  return project;
}

/**
 * Prompt for environment
 */
export async function promptEnvironment(): Promise<string> {
  const presets = ['development', 'staging', 'production', 'test', 'local', 'ci'];
  
  const { environment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'environment',
      message: 'Select environment:',
      choices: [
        ...presets.map(e => ({ name: e, value: e })),
        new inquirer.Separator(),
        { name: '+ Custom environment', value: '__custom__' },
      ],
    },
  ]);
  
  if (environment === '__custom__') {
    const { customEnv } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customEnv',
        message: 'Enter environment name:',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Environment name is required';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
            return 'Environment name can only contain letters, numbers, dashes, and underscores';
          }
          return true;
        },
      },
    ]);
    return customEnv;
  }
  
  return environment;
}

/**
 * Prompt for variable key-value pairs
 */
export async function promptVariables(): Promise<Record<string, string>> {
  const variables: Record<string, string> = {};
  
  console.log('\nEnter environment variables (empty key to finish):');
  
  while (true) {
    const { key } = await inquirer.prompt([
      {
        type: 'input',
        name: 'key',
        message: 'Variable name:',
      },
    ]);
    
    if (!key || key.trim().length === 0) {
      break;
    }
    
    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: `Value for ${key}:`,
      },
    ]);
    
    variables[key.trim()] = value;
  }
  
  return variables;
}

/**
 * Confirm action
 */
export async function confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  
  return confirmed;
}

/**
 * Select from a list
 */
export async function select<T>(
  message: string, 
  choices: Array<{ name: string; value: T }>
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
    },
  ]);
  
  return selected;
}

