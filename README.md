# ◆ Envmatic

**Your secrets, your control.**

Envmatic is a cross-platform CLI tool for managing dotfiles and environment secrets. It uses Git as a secure, private storage backend with optional encryption.

## Features

- 🔐 **AES-256 Encryption** - Protect secrets with password or SSH key
- 🌐 **Git-Based Storage** - Use any private Git repository
- 📁 **Organized Structure** - Intuitive project/environment hierarchy
- 🔗 **Smart Linking** - Symlink or copy secrets to projects
- 🔒 **Immutable Files** - Protect against accidental changes
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

## Commands

### Setup

| Command | Description |
|---------|-------------|
| `envmatic init` | Initialize with a Git repository |
| `envmatic status` | Show current status and configuration |

### File Management

| Command | Description |
|---------|-------------|
| `envmatic add` | Add a new env file interactively |
| `envmatic import <path>` | Import an existing .env file |
| `envmatic list` | List all env files |
| `envmatic show <file-id>` | Display file contents |
| `envmatic edit <file-id>` | Edit a file interactively |
| `envmatic set <file-id> <key> <value>` | Set a single variable |
| `envmatic unset <file-id> <key>` | Remove a variable |
| `envmatic delete <file-id>` | Delete an env file |

### Project Integration

| Command | Description |
|---------|-------------|
| `envmatic use [file-id]` | Import env file into current project |
| `envmatic pull` | Auto-detect project and pull matching env |
| `envmatic link <file-id> <target>` | Create a symlink |
| `envmatic copy <file-id> <target>` | Create a decrypted copy |
| `envmatic unlink <target>` | Remove a linked file |
| `envmatic links` | List all linked files |

### Sync

| Command | Description |
|---------|-------------|
| `envmatic sync` | Sync with remote repository |
| `envmatic sync-links` | Update all copied files |

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

## Encryption

Envmatic uses **AES-256-GCM** encryption with PBKDF2 key derivation.

### Password Mode
You'll be prompted for your password when accessing encrypted files.

### SSH Key Mode
Uses your existing SSH private key for encryption - no password needed if your key is loaded in ssh-agent.

**⚠️ Important:** Your password or SSH key cannot be recovered. Keep them safe!

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

## Security Considerations

1. **Private Repository**: Always use a private Git repository
2. **Access Control**: Use Git's access controls to limit who can access secrets
3. **Encryption**: Enable encryption for sensitive production secrets
4. **SSH Keys**: Consider using SSH key encryption for convenience with security
5. **File Permissions**: Enable immutable mode to prevent accidental changes

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

## Troubleshooting

### Symlinks on Windows

Creating symlinks on Windows requires either:
- **Developer Mode** enabled (Settings → Update & Security → For developers)
- Running as Administrator

Alternatively, use the `--copy` flag to create copies instead of symlinks.

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

## License

MIT

