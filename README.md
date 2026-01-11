# ◆ Envmatic

**Your secrets, your control.**

Envmatic is a cross-platform CLI tool for managing dotfiles and environment secrets. It uses Git as a secure, private storage backend with optional AES-256 encryption.

## Features

- 🔐 **AES-256 Encryption** - Protect secrets with password or SSH key
- 🌐 **Git-Based Storage** - Use any private Git repository
- 📁 **Organized Structure** - Intuitive project/environment hierarchy
- 🔗 **Smart Linking** - Symlink or copy secrets to projects
- 🔒 **Immutable Files** - Protect against accidental changes
- ✏️ **External Editor Support** - Edit with Vim, Neovim, VS Code, etc.
- 🔄 **Password Rotation** - Change encryption password or switch methods
- 🖥️ **Cross-Platform** - Works on Windows, macOS, and Linux

## Installation

```bash
npm install -g envmatic
```

Or use with npx:

```bash
npx envmatic init
```

## Quick Start

### 1. Initialize with your private repo

```bash
envmatic init
```

You'll be prompted for:
- Your private Git repository URL
- Encryption preference (password or SSH key)
- File protection settings

### 2. Add your first env file

```bash
envmatic add
```

Or import an existing file:

```bash
envmatic import .env --project myapp --environment development
```

### 3. Use in your project

```bash
# Quick: Auto-detect project and pull matching env
cd myapp
envmatic pull

# Or specify environment
envmatic pull --env production

# Or browse and select manually
envmatic use

# Or use a specific file ID
envmatic use "myapp/development/.env"
```

---

## Commands Reference

### Setup & Configuration

#### `envmatic init`

Initialize Envmatic with a Git repository.

```bash
envmatic init [options]
```

| Option | Description |
|--------|-------------|
| `-f, --force` | Force re-initialization (overwrites current settings) |

#### `envmatic status`

Show current status and configuration.

```bash
envmatic status [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

---

### Security & Encryption

#### `envmatic change-password`

Change your encryption password. Requires the current password to decrypt and re-encrypt all files.

```bash
envmatic change-password
```

> ⚠️ **Warning:** If you forget your password, all encrypted data will be permanently lost.

#### `envmatic rotate-key`

Rotate encryption key or change encryption method (password ↔ SSH key).

```bash
envmatic rotate-key
```

Allows you to:
- Switch from password to SSH key encryption
- Switch from SSH key to password encryption
- Disable encryption (not recommended)

---

### File Management

#### `envmatic add`

Add a new env file to the vault interactively.

```bash
envmatic add [options]
```

| Option | Description |
|--------|-------------|
| `-p, --project <name>` | Project name |
| `-e, --environment <name>` | Environment name |
| `-n, --name <name>` | File name (default: `.env`) |
| `-d, --description <text>` | Description |

#### `envmatic import`

Import an existing `.env` file into the vault.

```bash
envmatic import <path> [options]
```

| Option | Description |
|--------|-------------|
| `-p, --project <name>` | Project name |
| `-e, --environment <name>` | Environment name |
| `-n, --name <name>` | File name |
| `-d, --description <text>` | Description |

**Example:**
```bash
envmatic import .env --project myapp --environment development
```

#### `envmatic list`

List all env files in the vault.

```bash
envmatic list [options]
# Alias: envmatic ls
```

| Option | Description |
|--------|-------------|
| `-p, --project <name>` | Filter by project |
| `--json` | Output as JSON |

#### `envmatic show`

Display contents of an env file.

```bash
envmatic show [file-id] [options]
# Alias: envmatic get
```

| Option | Description |
|--------|-------------|
| `-r, --reveal` | Reveal full values (not masked) |
| `--json` | Output as JSON |

**Example:**
```bash
envmatic show myapp/development/.env --reveal
```

#### `envmatic edit`

Edit an env file interactively or with an external editor.

```bash
envmatic edit [file-id] [options]
```

| Option | Description |
|--------|-------------|
| `-e, --editor` | Open in external editor (Vim, Neovim, VS Code, etc.) |

**Interactive mode (default):**
```bash
envmatic edit myapp/development/.env
```

**External editor mode:**
```bash
envmatic edit myapp/development/.env --editor
```

When using `--editor`, you'll be prompted to choose from available editors on your system.

#### `envmatic set`

Set a single variable in an env file.

```bash
envmatic set <file-id> <key> <value>
```

**Example:**
```bash
envmatic set myapp/production/.env API_KEY sk-1234567890
```

#### `envmatic unset`

Remove a variable from an env file.

```bash
envmatic unset <file-id> <key>
```

**Example:**
```bash
envmatic unset myapp/production/.env OLD_API_KEY
```

#### `envmatic delete`

Delete an env file from the vault.

```bash
envmatic delete [file-id]
# Alias: envmatic rm
```

#### `envmatic lock`

Lock (protect) env files after editing. Lists all unlocked files and allows you to secure them.

```bash
envmatic lock [file-id] [options]
```

| Option | Description |
|--------|-------------|
| `-a, --all` | Lock all unlocked files |

**Examples:**
```bash
# List and lock unlocked files interactively
envmatic lock

# Lock a specific file
envmatic lock myapp/development/.env

# Lock all unlocked files
envmatic lock --all
```

---

### Project Integration

#### `envmatic use`

Import an env file into the current project.

```bash
envmatic use [file-id] [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output file path (default: `.env`) |
| `-s, --symlink` | Create symlink instead of copy |
| `-f, --force` | Overwrite without confirmation |

**Example:**
```bash
envmatic use myapp/production/.env --output .env.production
```

#### `envmatic pull`

Auto-detect project and pull matching env file.

```bash
envmatic pull [options]
```

| Option | Description |
|--------|-------------|
| `-e, --env <name>` | Environment name (development, production, etc.) |
| `-o, --output <path>` | Output file path (default: `.env`) |
| `-s, --symlink` | Create symlink instead of copy |
| `-f, --force` | Overwrite without confirmation |

**Example:**
```bash
cd myapp
envmatic pull --env production --output .env
```

#### `envmatic link`

Create a symlink to an env file.

```bash
envmatic link [file-id] [target] [options]
```

| Option | Description |
|--------|-------------|
| `-c, --copy` | Create a copy instead of symlink |
| `-a, --auto-sync` | Auto-sync copies on changes |

> **Note:** Symlinks only work for unencrypted files. Encrypted files require copy mode.

**Example:**
```bash
envmatic link myapp/development/.env ./.env
```

#### `envmatic copy`

Create a decrypted copy of an env file.

```bash
envmatic copy [file-id] [target] [options]
```

| Option | Description |
|--------|-------------|
| `-a, --auto-sync` | Auto-sync on changes |

**Example:**
```bash
envmatic copy myapp/production/.env ./.env
```

#### `envmatic unlink`

Remove a linked file.

```bash
envmatic unlink [target]
```

#### `envmatic links`

List all linked files.

```bash
envmatic links [options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

---

### Sync

#### `envmatic sync`

Sync vault with remote repository.

```bash
envmatic sync [options]
```

| Option | Description |
|--------|-------------|
| `--push` | Push only |
| `--pull` | Pull only |

#### `envmatic sync-links`

Update all copied files from vault.

```bash
envmatic sync-links
```

---

## Vault Structure

Your secrets are organized in an intuitive hierarchy:

```
~/.envmatic/vault/
├── myapp/
│   ├── development/
│   │   └── .env.enc
│   ├── staging/
│   │   └── .env.enc
│   └── production/
│       └── .env.enc
├── another-project/
│   └── local/
│       └── .env.enc
└── shared/
    └── common/
        └── .env.enc
```

---

## Encryption

Envmatic uses **AES-256-GCM** encryption with PBKDF2 key derivation (100,000 iterations, SHA-512).

### Password Mode

You'll be prompted for your password when accessing encrypted files.

```
⚠️ PASSWORD SECURITY WARNING

Your password is the ONLY way to decrypt your secrets.
There is NO password recovery mechanism.

If you forget your password:
→ All encrypted data will be PERMANENTLY LOST
→ There is NO way to recover your secrets

We strongly recommend:
• Using a password manager to store your password
• Writing it down and storing it securely offline
```

### SSH Key Mode

Uses your existing SSH private key for encryption. No password prompt needed if your key is loaded in ssh-agent.

### Changing Password or Encryption Method

```bash
# Change password (requires current password)
envmatic change-password

# Switch encryption method (password ↔ SSH key)
envmatic rotate-key
```

---

## Programmatic Usage

Envmatic can be imported into your Node.js projects:

```typescript
import {
  readEnvFile,
  listEnvFiles,
  getVariable,
} from 'envmatic';

// List all files
const files = await listEnvFiles();

// Read a file (with encryption options if needed)
const { variables } = await readEnvFile('myapp/development/.env', {
  method: 'password',
  password: process.env.ENVMATIC_PASSWORD,
});

// Get a single variable
const apiKey = await getVariable('myapp/production/.env', 'API_KEY', {
  method: 'ssh',
  sshKeyPath: '~/.ssh/id_rsa',
});
```

---

## Security Considerations

1. **Private Repository**: Always use a private Git repository
2. **Access Control**: Use Git's access controls to limit who can access secrets
3. **Encryption**: Enable encryption for sensitive production secrets
4. **SSH Keys**: Consider using SSH key encryption for convenience with security
5. **File Permissions**: Enable immutable mode to prevent accidental changes
6. **Password Storage**: Use a password manager; there's no recovery mechanism

---

## Configuration

Configuration is stored in `~/.envmatic/config.json`:

```json
{
  "repoUrl": "git@github.com:you/secrets.git",
  "encryptionEnabled": true,
  "encryptionMethod": "password",
  "immutableByDefault": true,
  "branch": "main"
}
```

---

## Troubleshooting

### Symlinks on Windows

Creating symlinks on Windows requires either:
- **Developer Mode** enabled (Settings → Update & Security → For developers)
- Running as Administrator

Alternatively, use the `--copy` flag or `envmatic copy` command.

### Git Authentication

Envmatic uses your system's Git configuration. Make sure you can:
```bash
git clone <your-repo-url>
```

### Encryption Issues

If you're having trouble with encryption:
1. Verify your password is correct
2. For SSH, ensure your key is readable: `ssh-keygen -y -f ~/.ssh/id_rsa`
3. The encryption salt is stored in your vault - don't delete `.envmatic-salt`

### Unlocked Files

If you edited files with `--editor` and forgot to lock them:
```bash
envmatic lock
```

This will list all unlocked files and let you secure them.

---

## License

MIT
