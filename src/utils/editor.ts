/**
 * Editor Utilities
 * Detection and launching of external editors
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export interface EditorInfo {
  name: string;
  command: string;
  available: boolean;
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const isWindows = os.platform() === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the system default editor
 */
function getSystemEditor(): string | undefined {
  // Check common environment variables
  return process.env.VISUAL || process.env.EDITOR;
}

/**
 * Detect available editors on the system
 */
export async function detectEditors(): Promise<EditorInfo[]> {
  const isWindows = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';
  
  const editors: EditorInfo[] = [];
  
  // System default editor
  const systemEditor = getSystemEditor();
  if (systemEditor) {
    editors.push({
      name: `System Default (${systemEditor})`,
      command: systemEditor,
      available: true,
    });
  }
  
  // Neovim
  if (await commandExists('nvim')) {
    editors.push({
      name: 'Neovim',
      command: 'nvim',
      available: true,
    });
  }
  
  // Vim
  if (await commandExists('vim')) {
    editors.push({
      name: 'Vim',
      command: 'vim',
      available: true,
    });
  }
  
  // VS Code
  if (await commandExists('code')) {
    editors.push({
      name: 'VS Code',
      command: 'code --wait',
      available: true,
    });
  }
  
  // Platform-specific editors
  if (isWindows) {
    // Notepad is always available on Windows
    editors.push({
      name: 'Notepad',
      command: 'notepad',
      available: true,
    });
    
    // Notepad++
    if (await commandExists('notepad++')) {
      editors.push({
        name: 'Notepad++',
        command: 'notepad++',
        available: true,
      });
    }
  }
  
  if (isMac) {
    // nano is usually available
    if (await commandExists('nano')) {
      editors.push({
        name: 'Nano',
        command: 'nano',
        available: true,
      });
    }
    
    // TextEdit via open command
    editors.push({
      name: 'TextEdit',
      command: 'open -e -W',
      available: true,
    });
  }
  
  // Linux common editors
  if (!isWindows && !isMac) {
    if (await commandExists('nano')) {
      editors.push({
        name: 'Nano',
        command: 'nano',
        available: true,
      });
    }
    
    if (await commandExists('gedit')) {
      editors.push({
        name: 'Gedit',
        command: 'gedit',
        available: true,
      });
    }
  }
  
  return editors;
}

/**
 * Open a file in an external editor and wait for it to close
 */
export async function openInEditor(filePath: string, editorCommand: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32';
    
    // Parse command (handle commands with arguments like "code --wait")
    const parts = editorCommand.split(' ');
    const command = parts[0];
    const args = [...parts.slice(1), filePath];
    
    // For terminal-based editors (vim, nvim, nano), we need to inherit stdio
    const isTerminalEditor = ['vim', 'nvim', 'nano', 'vi'].includes(command);
    
    const child = spawn(command, args, {
      stdio: isTerminalEditor ? 'inherit' : 'ignore',
      shell: isWindows,
      detached: false,
    });
    
    child.on('error', (err) => {
      reject(new Error(`Failed to open editor: ${err.message}`));
    });
    
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

/**
 * Check if an editor is a terminal-based editor
 */
export function isTerminalEditor(editorCommand: string): boolean {
  const command = editorCommand.split(' ')[0];
  return ['vim', 'nvim', 'nano', 'vi', 'emacs'].includes(command);
}

