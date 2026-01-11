/**
 * List Command
 * List all env files in the vault
 */

import { listEnvFiles, listProjects } from '../services/envfile.js';
import { getConfig } from '../services/config.js';
import { printBanner, error, colors, formatFileId, formatDate, dim } from '../utils/display.js';
import type { EnvFile } from '../types/index.js';

export async function listCommand(options: {
  project?: string;
  json?: boolean;
}): Promise<void> {
  if (!options.json) {
    printBanner();
  }
  
  const config = await getConfig();
  if (!config) {
    error('Envmatic is not initialized. Run `envmatic init` first.');
    return;
  }
  
  const files = await listEnvFiles(options.project);
  const projects = await listProjects();
  
  if (options.json) {
    console.log(JSON.stringify({ projects, files }, null, 2));
    return;
  }
  
  if (files.length === 0) {
    dim('No env files found.');
    console.log();
    console.log('Add your first file: ' + colors.primary('envmatic add'));
    return;
  }
  
  // Group files by project
  const grouped: Record<string, EnvFile[]> = {};
  
  for (const file of files) {
    if (!grouped[file.project]) {
      grouped[file.project] = [];
    }
    grouped[file.project].push(file);
  }
  
  console.log(colors.muted(`Found ${files.length} file(s) in ${projects.length} project(s)\n`));
  
  for (const project of Object.keys(grouped).sort()) {
    const projectFiles = grouped[project];
    
    console.log(colors.primary.bold(`◆ ${project}`));
    
    for (let i = 0; i < projectFiles.length; i++) {
      const file = projectFiles[i];
      const isLast = i === projectFiles.length - 1;
      const connector = isLast ? '└─' : '├─';
      
      const envLabel = file.environment 
        ? colors.secondary(file.environment) 
        : colors.muted('default');
      
      const flags = [];
      if (file.encrypted) flags.push(colors.accent('🔒'));
      if (file.immutable) flags.push(colors.muted('📌'));
      
      const flagStr = flags.length > 0 ? ' ' + flags.join(' ') : '';
      
      console.log(
        colors.muted(`  ${connector} `) + 
        envLabel + 
        colors.muted('/') + 
        file.name + 
        flagStr
      );
      
      if (file.description) {
        const descConnector = isLast ? '   ' : '│  ';
        console.log(colors.muted(`  ${descConnector}   ${file.description}`));
      }
    }
    
    console.log();
  }
  
  console.log(colors.muted('Legend: 🔒 encrypted  📌 immutable'));
  console.log();
  console.log(colors.muted('Commands:'));
  console.log('  Show file:   ' + colors.primary('envmatic show <file-id>'));
  console.log('  Link file:   ' + colors.primary('envmatic link <file-id> <target>'));
  console.log('  Edit file:   ' + colors.primary('envmatic edit <file-id>'));
}

