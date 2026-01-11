/**
 * Show Command
 * Display contents of an env file
 */

import { readEnvFile, listEnvFiles } from '../services/envfile.js';
import { getConfig } from '../services/config.js';
import { 
  printBanner, 
  error, 
  colors, 
  formatFileId, 
  formatDate,
  maskValue,
  box,
  keyValue
} from '../utils/display.js';
import { getEncryptionOptions, select } from '../utils/prompts.js';

export async function showCommand(
  fileId?: string,
  options: {
    reveal?: boolean;
    json?: boolean;
  } = {}
): Promise<void> {
  if (!options.json) {
    printBanner();
  }
  
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
      'Select an env file:',
      files.map(f => ({
        name: `${f.project}/${f.environment || 'default'}/${f.name}`,
        value: f.id,
      }))
    );
  }
  
  try {
    const encryptionOptions = await getEncryptionOptions();
    const { metadata, variables } = await readEnvFile(fileId, encryptionOptions);
    
    if (options.json) {
      const output = options.reveal 
        ? { metadata, variables }
        : { 
            metadata, 
            variables: Object.fromEntries(
              Object.entries(variables).map(([k, v]) => [k, maskValue(v)])
            )
          };
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    
    // Display file info
    console.log(formatFileId(metadata.id) + '\n');
    
    keyValue('Created', formatDate(metadata.createdAt));
    keyValue('Updated', formatDate(metadata.updatedAt));
    keyValue('Encrypted', metadata.encrypted ? 'yes' : 'no');
    keyValue('Immutable', metadata.immutable ? 'yes' : 'no');
    
    if (metadata.description) {
      keyValue('Description', metadata.description);
    }
    
    console.log();
    
    // Display variables
    const varCount = Object.keys(variables).length;
    console.log(colors.muted(`Variables (${varCount}):\n`));
    
    const maxKeyLength = Math.max(...Object.keys(variables).map(k => k.length));
    
    for (const [key, value] of Object.entries(variables)) {
      const paddedKey = key.padEnd(maxKeyLength);
      const displayValue = options.reveal ? value : maskValue(value);
      
      console.log(`  ${colors.secondary(paddedKey)}  ${colors.muted('=')}  ${displayValue}`);
    }
    
    console.log();
    
    if (!options.reveal) {
      console.log(colors.muted('Values are masked. Use --reveal to show full values.'));
    }
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(errorMessage);
  }
}

