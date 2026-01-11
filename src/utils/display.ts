/**
 * Display Utilities
 * Console styling and formatting for CLI output
 */

import chalk from 'chalk';
import { BRAND } from '../constants.js';

/**
 * Brand colors
 */
export const colors = {
  primary: chalk.hex('#7C3AED'),    // Purple
  secondary: chalk.hex('#10B981'),  // Emerald
  accent: chalk.hex('#F59E0B'),     // Amber
  muted: chalk.gray,
  error: chalk.hex('#EF4444'),
  success: chalk.hex('#10B981'),
  warning: chalk.hex('#F59E0B'),
  info: chalk.hex('#3B82F6'),
};

/**
 * Print the envmatic banner
 */
export function printBanner(): void {
  console.log();
  console.log(colors.primary.bold(`  ${BRAND.prefix} ${BRAND.name}`));
  console.log(colors.muted(`    ${BRAND.tagline}`));
  console.log();
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(colors.success(`${BRAND.prefix} ${message}`));
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.log(colors.error(`✖ ${message}`));
}

/**
 * Print a warning message
 */
export function warning(message: string): void {
  console.log(colors.warning(`⚠ ${message}`));
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(colors.info(`ℹ ${message}`));
}

/**
 * Print a dimmed/muted message
 */
export function dim(message: string): void {
  console.log(colors.muted(message));
}

/**
 * Print a key-value pair
 */
export function keyValue(key: string, value: string, indent: number = 0): void {
  const spaces = ' '.repeat(indent);
  console.log(`${spaces}${colors.muted(key + ':')} ${value}`);
}

/**
 * Print a table header
 */
export function tableHeader(...columns: string[]): void {
  console.log(colors.muted(columns.join('  ')));
  console.log(colors.muted('─'.repeat(60)));
}

/**
 * Print a tree item
 */
export function treeItem(label: string, isLast: boolean = false, depth: number = 0): void {
  const indent = '  '.repeat(depth);
  const connector = isLast ? '└─' : '├─';
  console.log(`${indent}${colors.muted(connector)} ${label}`);
}

/**
 * Format a file ID for display
 */
export function formatFileId(fileId: string): string {
  const parts = fileId.split('/');
  if (parts.length >= 3) {
    const [project, env, ...rest] = parts;
    return `${colors.primary(project)}${colors.muted('/')}${colors.secondary(env)}${colors.muted('/')}${rest.join('/')}`;
  }
  return fileId;
}

/**
 * Format a date for display
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create a box around text
 */
export function box(lines: string[], title?: string): void {
  const maxLength = Math.max(...lines.map(l => l.length), (title?.length || 0) + 4);
  const width = maxLength + 4;
  
  const top = title 
    ? `╭─ ${title} ${'─'.repeat(width - title.length - 5)}╮`
    : `╭${'─'.repeat(width - 2)}╮`;
  
  console.log(colors.muted(top));
  
  for (const line of lines) {
    const padding = ' '.repeat(width - line.length - 4);
    console.log(colors.muted('│') + ` ${line}${padding} ` + colors.muted('│'));
  }
  
  console.log(colors.muted(`╰${'─'.repeat(width - 2)}╯`));
}

/**
 * Mask sensitive values
 */
export function maskValue(value: string, showChars: number = 4): string {
  if (value.length <= showChars * 2) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);
  const middle = '*'.repeat(Math.min(value.length - showChars * 2, 8));
  return start + middle + end;
}

