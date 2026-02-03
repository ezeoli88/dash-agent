# dash-agent - Plan de Publicacion en npm

## Resumen Ejecutivo

Este documento describe el plan para reestructurar el proyecto Agent Board como un paquete npm publicable bajo el nombre `dash-agent`. El objetivo es permitir que los usuarios puedan instalar y usar el dashboard con un simple comando:

```bash
npx dash-agent
# o
npm install -g dash-agent
dash-agent start
```

**Estado actual:**
- **Frontend**: Next.js 16.1 funcional en `frontend/`
- **Backend**: Express/TypeScript funcional en `backend/`
- **Shared**: Paquete de tipos compartidos en `packages/shared/`

**Objetivo**: Transformar el proyecto en un monorepo publicable que incluya CLI, servidor y dashboard.

---

## 1. Nueva Estructura del Proyecto

```
dash-agent/
├── packages/
│   ├── cli/                      # Entry point - comando `dash-agent`
│   │   ├── package.json          # @dash-agent/cli
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # CLI entry point (bin)
│   │       ├── cli.ts            # Commander.js setup
│   │       └── commands/
│   │           ├── start.ts      # Comando: dash-agent start
│   │           ├── init.ts       # Comando: dash-agent init
│   │           └── stop.ts       # Comando: dash-agent stop
│   ├── server/                   # Backend Express (mover desde backend/)
│   │   ├── package.json          # @dash-agent/server
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # Export programatico del servidor
│   │       ├── app.ts            # Express app factory
│   │       ├── routes/
│   │       ├── services/
│   │       └── ...
│   ├── dashboard/                # Frontend Next.js (mover desde frontend/)
│   │   ├── package.json          # @dash-agent/dashboard
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   └── src/
│   │       └── ...
│   └── shared/                   # Tipos compartidos (ya existe)
│       ├── package.json          # @dash-agent/shared
│       ├── tsconfig.json
│       └── src/
│           ├── schemas/
│           ├── types/
│           └── index.ts
├── package.json                  # Root workspace + metadata para npm
├── tsconfig.base.json            # Configuracion base TypeScript
├── turbo.json                    # Turborepo config (opcional)
├── README.md                     # Documentacion principal
├── LICENSE                       # MIT License
└── .github/
    └── workflows/
        └── publish.yml           # GitHub Action para publicar
```

---

## 2. Estrategia de Publicacion

### Opcion A: Paquete Unico (Recomendado)

Publicar un solo paquete `dash-agent` que incluye todo lo necesario.

**Ventajas:**
- Instalacion simple: `npm install -g dash-agent`
- Sin problemas de versionado entre paquetes
- Mejor experiencia de usuario

**Desventajas:**
- Paquete mas grande
- No permite usar server/dashboard por separado

### Opcion B: Paquetes Separados

Publicar multiples paquetes bajo el scope `@dash-agent/`:
- `@dash-agent/cli` - Comando CLI
- `@dash-agent/server` - Servidor Express
- `@dash-agent/dashboard` - Frontend Next.js
- `@dash-agent/shared` - Tipos compartidos

**Ventajas:**
- Modularidad
- Usuarios pueden usar solo lo que necesitan

**Desventajas:**
- Complejidad de versionado
- Instalacion mas compleja

**Decision:** Usar **Opcion A** (paquete unico) para simplificar la experiencia del usuario.

---

## 3. Plan de Fases

### Fase 1: Reestructuracion a Monorepo

**Objetivo:** Mover el codigo existente a la nueva estructura de paquetes.

**Tareas:**

1.1. Crear estructura de directorios:
```bash
mkdir -p packages/cli/src/commands
mkdir -p packages/server
mkdir -p packages/dashboard
```

1.2. Mover frontend a packages/dashboard:
```bash
mv frontend/* packages/dashboard/
```

1.3. Mover backend a packages/server:
```bash
mv backend/* packages/server/
```

1.4. Actualizar package.json del root:
```json
{
  "name": "dash-agent",
  "version": "0.1.0",
  "description": "AI Agent Task Dashboard - Monitor and manage autonomous AI agent tasks",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev": "npm run dev --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

1.5. Actualizar paths en cada paquete:
- Actualizar imports relativos
- Actualizar tsconfig.json paths
- Actualizar referencias a @agent-board/shared -> @dash-agent/shared

**Entregables:**
- [ ] Estructura de directorios creada
- [ ] Codigo movido a nuevas ubicaciones
- [ ] package.json de cada paquete actualizado
- [ ] Proyecto compila sin errores

---

### Fase 2: Crear CLI Package

**Objetivo:** Crear el paquete CLI que sirve como entry point para los usuarios.

**Tareas:**

2.1. Crear packages/cli/package.json:
```json
{
  "name": "@dash-agent/cli",
  "version": "0.1.0",
  "description": "CLI for dash-agent",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "dash-agent": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "dotenv": "^16.0.0",
    "detect-port": "^1.5.1",
    "@dash-agent/server": "workspace:*",
    "@dash-agent/dashboard": "workspace:*"
  }
}
```

2.2. Crear CLI entry point (packages/cli/src/index.ts):
```typescript
#!/usr/bin/env node
import { program } from 'commander';
import { startCommand } from './commands/start';
import { initCommand } from './commands/init';
import { stopCommand } from './commands/stop';

program
  .name('dash-agent')
  .description('AI Agent Task Dashboard')
  .version('0.1.0');

program
  .command('start')
  .description('Start the dash-agent server and dashboard')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-d, --dashboard-port <port>', 'Dashboard port', '3001')
  .option('--server-only', 'Start only the backend server')
  .option('--dashboard-only', 'Start only the dashboard')
  .option('--no-open', 'Do not open browser automatically')
  .action(startCommand);

program
  .command('init')
  .description('Initialize dash-agent configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(initCommand);

program
  .command('stop')
  .description('Stop running dash-agent processes')
  .action(stopCommand);

program.parse();
```

2.3. Implementar comando start (packages/cli/src/commands/start.ts):
```typescript
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import detectPort from 'detect-port';
import path from 'path';
import { existsSync } from 'fs';

interface StartOptions {
  port: string;
  dashboardPort: string;
  serverOnly?: boolean;
  dashboardOnly?: boolean;
  open?: boolean;
}

export async function startCommand(options: StartOptions) {
  const spinner = ora('Starting dash-agent...').start();

  // Verificar variables de entorno requeridas
  const requiredEnvVars = ['OPENAI_API_KEY'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingVars.length > 0 && !options.dashboardOnly) {
    spinner.fail(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.log(chalk.yellow('\nRun `dash-agent init` to create a configuration file.'));
    process.exit(1);
  }

  // Detectar puertos disponibles
  const serverPort = parseInt(options.port, 10);
  const dashboardPort = parseInt(options.dashboardPort, 10);

  const availableServerPort = await detectPort(serverPort);
  const availableDashboardPort = await detectPort(dashboardPort);

  if (availableServerPort !== serverPort) {
    spinner.warn(`Port ${serverPort} is in use, using ${availableServerPort} instead`);
  }

  if (availableDashboardPort !== dashboardPort) {
    spinner.warn(`Port ${dashboardPort} is in use, using ${availableDashboardPort} instead`);
  }

  const processes: ReturnType<typeof spawn>[] = [];

  // Iniciar servidor
  if (!options.dashboardOnly) {
    spinner.text = 'Starting server...';
    const serverPath = require.resolve('@dash-agent/server');
    const serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: String(availableServerPort),
      },
      stdio: 'inherit',
    });
    processes.push(serverProcess);
  }

  // Iniciar dashboard
  if (!options.serverOnly) {
    spinner.text = 'Starting dashboard...';
    const dashboardPath = path.dirname(require.resolve('@dash-agent/dashboard/package.json'));
    const dashboardProcess = spawn('npx', ['next', 'start', '-p', String(availableDashboardPort)], {
      cwd: dashboardPath,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: `http://localhost:${availableServerPort}`,
      },
      stdio: 'inherit',
      shell: true,
    });
    processes.push(dashboardProcess);
  }

  spinner.succeed('dash-agent started successfully!');

  console.log('');
  if (!options.dashboardOnly) {
    console.log(chalk.green(`  Server:    http://localhost:${availableServerPort}`));
  }
  if (!options.serverOnly) {
    console.log(chalk.green(`  Dashboard: http://localhost:${availableDashboardPort}`));
  }
  console.log('');
  console.log(chalk.gray('Press Ctrl+C to stop'));

  // Abrir navegador automaticamente
  if (options.open !== false && !options.serverOnly) {
    const open = await import('open');
    await open.default(`http://localhost:${availableDashboardPort}`);
  }

  // Manejar cierre graceful
  process.on('SIGINT', () => {
    console.log('\n' + chalk.yellow('Stopping dash-agent...'));
    processes.forEach(p => p.kill());
    process.exit(0);
  });
}
```

2.4. Implementar comando init (packages/cli/src/commands/init.ts):
```typescript
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface InitOptions {
  force?: boolean;
}

const ENV_TEMPLATE = `# dash-agent Configuration
# Required: OpenAI API Key for the AI agent
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional: GitHub Personal Access Token (for creating PRs)
GITHUB_TOKEN=ghp_your-github-token-here

# Server Configuration
PORT=3000
DASHBOARD_PORT=3001

# Data Storage
DATABASE_PATH=./data/dash-agent.db
REPOS_BASE_DIR=./repos
WORKTREES_DIR=./worktrees

# Logging
LOG_LEVEL=info
`;

export async function initCommand(options: InitOptions) {
  const spinner = ora('Initializing dash-agent...').start();

  const envPath = path.join(process.cwd(), '.env');

  if (existsSync(envPath) && !options.force) {
    spinner.fail('.env file already exists. Use --force to overwrite.');
    process.exit(1);
  }

  writeFileSync(envPath, ENV_TEMPLATE);

  spinner.succeed('Created .env configuration file');

  console.log('');
  console.log(chalk.yellow('Next steps:'));
  console.log('  1. Edit .env and add your OPENAI_API_KEY');
  console.log('  2. Optionally add GITHUB_TOKEN for PR creation');
  console.log('  3. Run `dash-agent start` to begin');
  console.log('');
}
```

2.5. Implementar comando stop (packages/cli/src/commands/stop.ts):
```typescript
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

export async function stopCommand() {
  const spinner = ora('Stopping dash-agent processes...').start();

  try {
    // Buscar y matar procesos de dash-agent
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq dash-agent*"', { stdio: 'ignore' });
    } else {
      execSync('pkill -f "dash-agent"', { stdio: 'ignore' });
    }
    spinner.succeed('dash-agent processes stopped');
  } catch {
    spinner.info('No running dash-agent processes found');
  }
}
```

**Entregables:**
- [ ] packages/cli/package.json creado
- [ ] CLI entry point implementado
- [ ] Comando start implementado
- [ ] Comando init implementado
- [ ] Comando stop implementado
- [ ] CLI compila correctamente

---

### Fase 3: Configurar Workspaces y Dependencias

**Objetivo:** Configurar npm workspaces para que los paquetes puedan referenciarse entre si.

**Tareas:**

3.1. Actualizar package.json del root:
```json
{
  "name": "dash-agent",
  "version": "0.1.0",
  "private": false,
  "description": "AI Agent Task Dashboard - Monitor and manage autonomous AI agent tasks",
  "keywords": [
    "ai",
    "agent",
    "dashboard",
    "task-management",
    "llm",
    "openai",
    "automation"
  ],
  "homepage": "https://github.com/your-username/dash-agent#readme",
  "bugs": {
    "url": "https://github.com/your-username/dash-agent/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-username/dash-agent.git"
  },
  "license": "MIT",
  "author": "Your Name",
  "main": "packages/cli/dist/index.js",
  "bin": {
    "dash-agent": "packages/cli/dist/index.js"
  },
  "files": [
    "packages/*/dist",
    "packages/*/package.json",
    "packages/dashboard/.next",
    "packages/dashboard/public"
  ],
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "build:cli": "npm run build -w @dash-agent/cli",
    "build:server": "npm run build -w @dash-agent/server",
    "build:dashboard": "npm run build -w @dash-agent/dashboard",
    "build:shared": "npm run build -w @dash-agent/shared",
    "dev": "concurrently \"npm run dev -w @dash-agent/server\" \"npm run dev -w @dash-agent/dashboard\"",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

3.2. Actualizar packages/shared/package.json:
```json
{
  "name": "@dash-agent/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

3.3. Actualizar packages/server/package.json:
```json
{
  "name": "@dash-agent/server",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@dash-agent/shared": "workspace:*",
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "zod": "^3.24.0",
    "sql.js": "^1.10.0",
    "openai": "^4.0.0",
    "@octokit/rest": "^21.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "@types/uuid": "^9.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

3.4. Actualizar packages/dashboard/package.json:
```json
{
  "name": "@dash-agent/dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev -p 3001",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@dash-agent/shared": "workspace:*",
    "next": "^16.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "zod": "^3.24.0"
  }
}
```

**Entregables:**
- [ ] Root package.json con workspaces configurado
- [ ] Cada paquete tiene su package.json correcto
- [ ] Dependencias internas usan workspace:*
- [ ] `npm install` funciona correctamente

---

### Fase 4: Integracion de Tipos Compartidos

**Objetivo:** Asegurar que todos los paquetes usan los tipos del paquete shared.

**Tareas:**

4.1. Verificar exports de @dash-agent/shared (packages/shared/src/index.ts):
```typescript
// Schemas
export * from './schemas/task.schema';
export * from './schemas/feedback.schema';

// Types
export * from './types/task';
export * from './types/sse';
export * from './types/api';
export * from './types/errors';
```

4.2. Crear tsconfig.base.json en root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

4.3. Actualizar tsconfig.json de cada paquete para extender base:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Entregables:**
- [ ] tsconfig.base.json creado
- [ ] Cada paquete extiende la configuracion base
- [ ] Imports de @dash-agent/shared funcionan

---

### Fase 5: Actualizar Imports en Dashboard y Server

**Objetivo:** Reemplazar imports de @agent-board/shared por @dash-agent/shared.

**Tareas:**

5.1. Buscar y reemplazar en packages/server:
```bash
# De: @agent-board/shared
# A:  @dash-agent/shared
```

5.2. Buscar y reemplazar en packages/dashboard:
```bash
# De: @agent-board/shared
# A:  @dash-agent/shared
```

5.3. Verificar que no quedan referencias antiguas:
```bash
grep -r "@agent-board" packages/
```

**Entregables:**
- [ ] Todos los imports actualizados
- [ ] No hay referencias a @agent-board
- [ ] Proyecto compila sin errores

---

### Fase 6: Configurar Build para Produccion

**Objetivo:** Configurar el proceso de build para generar artefactos publicables.

**Tareas:**

6.1. Configurar build order (el orden importa):
1. @dash-agent/shared (primero, sin dependencias internas)
2. @dash-agent/server (depende de shared)
3. @dash-agent/dashboard (depende de shared)
4. @dash-agent/cli (depende de server y dashboard)

6.2. Actualizar scripts de build en root package.json:
```json
{
  "scripts": {
    "build": "npm run build:shared && npm run build:server && npm run build:dashboard && npm run build:cli",
    "build:shared": "npm run build -w @dash-agent/shared",
    "build:server": "npm run build -w @dash-agent/server",
    "build:dashboard": "npm run build -w @dash-agent/dashboard",
    "build:cli": "npm run build -w @dash-agent/cli"
  }
}
```

6.3. Configurar Next.js para produccion standalone (packages/dashboard/next.config.ts):
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Permite que el dashboard funcione cuando se instala como dependencia
  experimental: {
    outputFileTracingRoot: undefined,
  },
};

export default nextConfig;
```

6.4. Crear script de post-install para el CLI:
```typescript
// packages/cli/scripts/postinstall.ts
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// Crear directorio de datos en home del usuario
const dataDir = path.join(homedir(), '.dash-agent');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
```

**Entregables:**
- [ ] Build order configurado correctamente
- [ ] Next.js configurado para standalone
- [ ] Scripts de postinstall creados
- [ ] `npm run build` genera todos los artefactos

---

### Fase 7: Configurar npm Publish

**Objetivo:** Preparar el paquete para publicacion en npm.

**Tareas:**

7.1. Actualizar package.json del root con metadata completa:
```json
{
  "name": "dash-agent",
  "version": "0.1.0",
  "description": "AI Agent Task Dashboard - Monitor and manage autonomous AI agent tasks with real-time logs, diff viewer, and PR creation",
  "keywords": [
    "ai",
    "agent",
    "dashboard",
    "task-management",
    "llm",
    "openai",
    "automation",
    "github",
    "pull-request",
    "code-review"
  ],
  "homepage": "https://github.com/your-username/dash-agent#readme",
  "bugs": {
    "url": "https://github.com/your-username/dash-agent/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-username/dash-agent.git"
  },
  "license": "MIT",
  "author": "Your Name <your@email.com>",
  "main": "packages/cli/dist/index.js",
  "bin": {
    "dash-agent": "packages/cli/dist/index.js"
  },
  "files": [
    "packages/cli/dist",
    "packages/server/dist",
    "packages/dashboard/.next/standalone",
    "packages/dashboard/.next/static",
    "packages/dashboard/public",
    "packages/shared/dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

7.2. Crear .npmignore:
```
# Source files
packages/*/src
packages/*/*.ts
!packages/*/dist

# Development
.git
.github
.vscode
node_modules
*.log

# Config
tsconfig*.json
turbo.json
.eslintrc*
.prettierrc*

# Tests
**/*.test.ts
**/*.spec.ts
__tests__
coverage

# Docs
docs/
*.md
!README.md

# Build artifacts we don't need
packages/dashboard/.next/cache
```

7.3. Crear script de pre-publish validation:
```json
{
  "scripts": {
    "prepublishOnly": "npm run build && npm run test && npm run validate-package",
    "validate-package": "node scripts/validate-package.js"
  }
}
```

7.4. Crear scripts/validate-package.js:
```javascript
const { existsSync } = require('fs');
const path = require('path');

const requiredFiles = [
  'packages/cli/dist/index.js',
  'packages/server/dist/index.js',
  'packages/shared/dist/index.js',
  'packages/dashboard/.next/standalone',
  'README.md',
  'LICENSE',
];

let hasErrors = false;

for (const file of requiredFiles) {
  if (!existsSync(path.join(__dirname, '..', file))) {
    console.error(`Missing required file: ${file}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log('Package validation passed!');
```

7.5. Crear GitHub Action para publish (.github/workflows/publish.yml):
```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Publish
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Entregables:**
- [ ] package.json con metadata completa
- [ ] .npmignore creado
- [ ] Script de validacion pre-publish
- [ ] GitHub Action para publish automatico

---

### Fase 8: Testing de Instalacion Local

**Objetivo:** Verificar que el paquete se puede instalar y usar correctamente.

**Tareas:**

8.1. Crear paquete local para testing:
```bash
npm pack
```

8.2. Instalar en directorio de prueba:
```bash
mkdir /tmp/test-dash-agent
cd /tmp/test-dash-agent
npm init -y
npm install /path/to/dash-agent-0.1.0.tgz
```

8.3. Verificar que el CLI funciona:
```bash
npx dash-agent --version
npx dash-agent --help
npx dash-agent init
npx dash-agent start --no-open
```

8.4. Crear script de test e2e:
```bash
#!/bin/bash
# scripts/test-local-install.sh

set -e

echo "Building package..."
npm run build

echo "Creating tarball..."
npm pack

echo "Creating test directory..."
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

echo "Installing package..."
npm init -y
npm install /path/to/dash-agent-*.tgz

echo "Testing CLI..."
npx dash-agent --version
npx dash-agent --help

echo "Testing init command..."
npx dash-agent init

echo "All tests passed!"

# Cleanup
cd -
rm -rf "$TEST_DIR"
```

8.5. Verificar funcionamiento en diferentes sistemas:
- [ ] Linux (Ubuntu 22.04+)
- [ ] macOS (Sonoma+)
- [ ] Windows (Windows 10/11)

**Entregables:**
- [ ] Paquete se instala correctamente con npm
- [ ] CLI responde a --version y --help
- [ ] Comando init crea archivo .env
- [ ] Comando start levanta servidor y dashboard
- [ ] Funciona en Linux, macOS y Windows

---

### Fase 9: Documentacion

**Objetivo:** Crear documentacion clara para usuarios del paquete.

**Tareas:**

9.1. Crear README.md principal:
```markdown
# dash-agent

AI Agent Task Dashboard - Monitor and manage autonomous AI agent tasks with real-time logs, diff viewer, and PR creation.

## Quick Start

```bash
# Install globally
npm install -g dash-agent

# Or use directly with npx
npx dash-agent

# Initialize configuration
dash-agent init

# Start the dashboard
dash-agent start
```

## Requirements

- Node.js 18+
- OpenAI API Key
- GitHub Personal Access Token (optional, for PR creation)

## Configuration

After running `dash-agent init`, edit the `.env` file:

```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key

# Optional (for PR creation)
GITHUB_TOKEN=ghp_your-github-token

# Server settings (optional)
PORT=3000
DASHBOARD_PORT=3001
```

## Commands

### `dash-agent start`

Start the server and dashboard.

```bash
dash-agent start [options]

Options:
  -p, --port <port>           Server port (default: 3000)
  -d, --dashboard-port <port> Dashboard port (default: 3001)
  --server-only               Start only the backend server
  --dashboard-only            Start only the dashboard
  --no-open                   Don't open browser automatically
```

### `dash-agent init`

Initialize configuration file.

```bash
dash-agent init [options]

Options:
  -f, --force    Overwrite existing configuration
```

### `dash-agent stop`

Stop running dash-agent processes.

```bash
dash-agent stop
```

## Features

- **Task Management**: Create and manage AI agent tasks
- **Real-time Logs**: Stream execution logs via SSE
- **Diff Viewer**: Review code changes before approval
- **PR Creation**: Automatically create GitHub PRs
- **Feedback Loop**: Send feedback to the agent mid-execution

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the AI agent |
| `GITHUB_TOKEN` | No | GitHub PAT for creating PRs |
| `PORT` | No | Server port (default: 3000) |
| `DASHBOARD_PORT` | No | Dashboard port (default: 3001) |
| `DATABASE_PATH` | No | SQLite database path |
| `LOG_LEVEL` | No | Logging level (default: info) |

## License

MIT
```

9.2. Agregar seccion de troubleshooting:
```markdown
## Troubleshooting

### Port already in use

If you see "Port XXXX is in use", dash-agent will automatically find an available port. You can also specify a different port:

```bash
dash-agent start --port 4000 --dashboard-port 4001
```

### OpenAI API errors

Ensure your `OPENAI_API_KEY` is valid and has sufficient credits.

### GitHub PR creation fails

Make sure your `GITHUB_TOKEN` has the `repo` scope and access to the target repository.
```

9.3. Crear CHANGELOG.md:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-03

### Added
- Initial release
- CLI with start, init, and stop commands
- Real-time log streaming via SSE
- Diff viewer for code changes
- GitHub PR creation
- Task feedback system
```

**Entregables:**
- [ ] README.md completo con instrucciones
- [ ] Seccion de troubleshooting
- [ ] CHANGELOG.md creado
- [ ] Documentacion de variables de entorno

---

## 4. Consideraciones Tecnicas

### 4.1 Deteccion de Puerto en Uso

El CLI debe detectar si los puertos estan en uso y:
1. Informar al usuario
2. Sugerir puertos alternativos
3. Usar `detect-port` para encontrar puertos disponibles

```typescript
import detectPort from 'detect-port';

const requestedPort = 3000;
const availablePort = await detectPort(requestedPort);

if (availablePort !== requestedPort) {
  console.log(`Port ${requestedPort} is in use, using ${availablePort} instead`);
}
```

### 4.2 Modo Desarrollo vs Produccion

El CLI debe soportar ambos modos:

**Produccion (default):**
```bash
dash-agent start
```
- Usa builds pre-compilados
- Next.js en modo produccion
- Sin hot-reload

**Desarrollo:**
```bash
dash-agent start --dev
```
- Usa `tsx` para server
- Next.js en modo desarrollo
- Hot-reload activo

### 4.3 Graceful Shutdown

El CLI debe manejar el cierre graceful:

```typescript
process.on('SIGINT', async () => {
  console.log('\nShutting down...');

  // Cerrar conexiones SSE activas
  await server.close();

  // Guardar estado de tareas en progreso
  await taskService.saveState();

  process.exit(0);
});
```

### 4.4 Health Checks

Implementar endpoints de health check:

```typescript
// packages/server/src/routes/health.ts
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version,
    uptime: process.uptime(),
  });
});
```

---

## 5. Checklist Final

### Fase 1: Reestructuracion
- [ ] Crear estructura de directorios
- [ ] Mover frontend a packages/dashboard
- [ ] Mover backend a packages/server
- [ ] Actualizar root package.json con workspaces
- [ ] Verificar que proyecto compila

### Fase 2: CLI
- [ ] Crear packages/cli/package.json
- [ ] Implementar CLI entry point
- [ ] Implementar comando start
- [ ] Implementar comando init
- [ ] Implementar comando stop
- [ ] Verificar CLI compila

### Fase 3: Workspaces
- [ ] Configurar npm workspaces
- [ ] Actualizar dependencias internas
- [ ] Verificar `npm install` funciona

### Fase 4: Tipos Compartidos
- [ ] Verificar exports de @dash-agent/shared
- [ ] Crear tsconfig.base.json
- [ ] Actualizar tsconfig de cada paquete

### Fase 5: Actualizar Imports
- [ ] Reemplazar @agent-board/shared por @dash-agent/shared en server
- [ ] Reemplazar @agent-board/shared por @dash-agent/shared en dashboard
- [ ] Verificar no hay referencias antiguas

### Fase 6: Build
- [ ] Configurar build order
- [ ] Configurar Next.js standalone
- [ ] Crear scripts de postinstall
- [ ] Verificar `npm run build` funciona

### Fase 7: npm Publish
- [ ] Completar metadata en package.json
- [ ] Crear .npmignore
- [ ] Crear script de validacion
- [ ] Configurar GitHub Action

### Fase 8: Testing Local
- [ ] Crear tarball con `npm pack`
- [ ] Instalar en directorio de prueba
- [ ] Verificar CLI funciona
- [ ] Probar en Linux, macOS, Windows

### Fase 9: Documentacion
- [ ] Crear README.md completo
- [ ] Agregar troubleshooting
- [ ] Crear CHANGELOG.md
- [ ] Documentar variables de entorno

---

## 6. Comandos Utiles

```bash
# Desarrollo local
npm install          # Instalar todas las dependencias
npm run dev          # Iniciar en modo desarrollo
npm run build        # Build de produccion

# Testing
npm test             # Ejecutar tests
npm run lint         # Verificar linting

# Publicacion
npm pack             # Crear tarball local
npm publish --dry-run # Simular publicacion
npm publish          # Publicar a npm

# Monorepo
npm run build -w @dash-agent/cli    # Build de un paquete especifico
npm ls --workspaces                  # Ver dependencias de workspaces
```

---

*Documento actualizado: 2026-02-03*
*Version: 2.0*
