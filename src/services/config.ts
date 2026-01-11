/**
 * Config Service
 * Manages local Envmatic configuration
 */

import fs from 'fs-extra';
import path from 'path';
import { ENVMATIC_HOME, CONFIG_PATH, LINKS_PATH, DEFAULT_BRANCH } from '../constants.js';
import type { EnvmaticConfig, LinkInfo } from '../types/index.js';

/**
 * Ensure envmatic home directory exists
 */
export async function ensureEnvmaticHome(): Promise<void> {
  await fs.ensureDir(ENVMATIC_HOME);
}

/**
 * Check if envmatic is configured
 */
export async function isConfigured(): Promise<boolean> {
  return fs.pathExists(CONFIG_PATH);
}

/**
 * Get current configuration
 */
export async function getConfig(): Promise<EnvmaticConfig | null> {
  if (!(await isConfigured())) {
    return null;
  }
  
  try {
    return await fs.readJson(CONFIG_PATH);
  } catch {
    return null;
  }
}

/**
 * Save configuration
 */
export async function saveConfig(config: EnvmaticConfig): Promise<void> {
  await ensureEnvmaticHome();
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

/**
 * Update configuration partially
 */
export async function updateConfig(updates: Partial<EnvmaticConfig>): Promise<EnvmaticConfig> {
  const current = await getConfig();
  
  if (!current) {
    throw new Error('Envmatic is not configured. Run `envmatic init` first.');
  }
  
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}

/**
 * Create initial configuration
 */
export function createInitialConfig(repoUrl: string, options: {
  encryptionEnabled?: boolean;
  encryptionMethod?: 'password' | 'ssh';
  sshKeyPath?: string;
  immutableByDefault?: boolean;
  branch?: string;
} = {}): EnvmaticConfig {
  return {
    repoUrl,
    localPath: ENVMATIC_HOME,
    encryptionEnabled: options.encryptionEnabled ?? true,
    encryptionMethod: options.encryptionMethod,
    sshKeyPath: options.sshKeyPath,
    immutableByDefault: options.immutableByDefault ?? true,
    branch: options.branch ?? DEFAULT_BRANCH,
  };
}

/**
 * Get all tracked links
 */
export async function getLinks(): Promise<LinkInfo[]> {
  if (!(await fs.pathExists(LINKS_PATH))) {
    return [];
  }
  
  try {
    return await fs.readJson(LINKS_PATH);
  } catch {
    return [];
  }
}

/**
 * Save links registry
 */
export async function saveLinks(links: LinkInfo[]): Promise<void> {
  await ensureEnvmaticHome();
  await fs.writeJson(LINKS_PATH, links, { spaces: 2 });
}

/**
 * Add a new link
 */
export async function addLink(link: LinkInfo): Promise<void> {
  const links = await getLinks();
  
  // Remove existing link for same target
  const filtered = links.filter(l => l.targetPath !== link.targetPath);
  filtered.push(link);
  
  await saveLinks(filtered);
}

/**
 * Remove a link by target path
 */
export async function removeLink(targetPath: string): Promise<boolean> {
  const links = await getLinks();
  const filtered = links.filter(l => l.targetPath !== targetPath);
  
  if (filtered.length === links.length) {
    return false; // Link not found
  }
  
  await saveLinks(filtered);
  return true;
}

/**
 * Get links for a specific env file
 */
export async function getLinksForEnvFile(sourceId: string): Promise<LinkInfo[]> {
  const links = await getLinks();
  return links.filter(l => l.sourceId === sourceId);
}

/**
 * Clear all configuration (for reset)
 */
export async function clearConfig(): Promise<void> {
  if (await fs.pathExists(CONFIG_PATH)) {
    await fs.remove(CONFIG_PATH);
  }
  if (await fs.pathExists(LINKS_PATH)) {
    await fs.remove(LINKS_PATH);
  }
}

/**
 * Get envmatic home path
 */
export function getEnvmaticHome(): string {
  return ENVMATIC_HOME;
}

