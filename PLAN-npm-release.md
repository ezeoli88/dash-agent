# Plan: Publicar `agent-board` en npm via Cloudflare R2

## Context

El objetivo es que `npx agent-board` funcione: descargar un binario compilado, cachearlo, y levantar server+frontend en un solo puerto. El proyecto ya tiene un CLI wrapper en `packages/cli/` y binarios compilados con `bun build --compile`, pero hay gaps críticos.

**Gaps encontrados:**
1. El binario no incluye los assets del frontend (el server busca `public/` en `process.cwd()`, no existe)
2. Los nombres de binarios no coinciden entre build scripts y CLI
3. Placeholders sin actualizar (`your-username`)
4. No hay CI/CD ni verificación de checksums

**Decisión:** Usar Cloudflare R2 como CDN para los binarios (el usuario tiene cuenta Cloudflare).

---

## Paso 0: Setup infraestructura (manual, one-time)

**El usuario debe:**
1. Crear bucket R2 `agent-board-releases` en Cloudflare Dashboard
2. Habilitar acceso público (R2.dev subdomain o custom domain)
3. Crear R2 API Token (Object Read & Write)
4. Crear npm automation token (`npm token create`)
5. Agregar secrets en GitHub repo `ezeoli88/dash-agent`:
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME` (`agent-board-releases`)
   - `R2_PUBLIC_URL` (ej: `https://pub-xxx.r2.dev`)
   - `NPM_TOKEN`

---

## Paso 1: Fix static asset resolution en el binario

**Archivo:** `packages/server/src/index.ts` (línea 72)

Cambiar de:
```ts
const staticDir = resolve(process.cwd(), 'public');
```
A:
```ts
import { dirname } from 'node:path';

const isBinaryMode = process.env['__BIN_MODE__'] === '1';
const baseDir = isBinaryMode ? dirname(process.execPath) : process.cwd();
const staticDir = resolve(baseDir, 'public');
```

Esto hace que el binario busque `public/` junto al ejecutable (donde el ZIP lo extrae).

---

## Paso 2: Fix build scripts + agregar arm64

**Archivo:** `package.json` (root)

Reemplazar los 4 scripts `build:binary*` con:
```json
"build:binary:linux-x64":   "bun build packages/server/src/bin.ts --compile --target=bun-linux-x64 --outfile dist/linux-x64/agent-board",
"build:binary:macos-x64":   "bun build packages/server/src/bin.ts --compile --target=bun-darwin-x64 --outfile dist/macos-x64/agent-board",
"build:binary:macos-arm64": "bun build packages/server/src/bin.ts --compile --target=bun-darwin-arm64 --outfile dist/macos-arm64/agent-board",
"build:binary:win-x64":     "bun build packages/server/src/bin.ts --compile --target=bun-windows-x64 --outfile dist/win-x64/agent-board.exe"
```

Cada binario va a su subdirectorio `dist/{platform}/` para luego copiar `public/` al lado.

---

## Paso 3: Rewrite CLI para R2 + ZIP + checksums

**Archivos:** `packages/cli/bin/cli.js` (rewrite), `packages/cli/bin/download.js` (nuevo)

### `bin/download.js` (nuevo)
Módulo de descarga con:
- `fetchJSON(url)` - fetch manifest/latest desde R2
- `downloadFile(url, dest, onProgress)` - descarga con progreso
- `verifySHA256(filePath, expectedHash)` - verificación de integridad
- `R2_BASE_URL` constante (se actualiza con la URL real del bucket)

### `bin/cli.js` (rewrite completo)
- Lee VERSION de `package.json` (no hardcoded)
- Platform detection: `linux-x64`, `macos-x64`, `macos-arm64`, `win-x64`
- Tag = `v{VERSION}` (simple, sin timestamp)
- Cache en `~/.cache/agent-board/v{VERSION}/{platform}/`
- Flow: check cache → fetch manifest → download ZIP → verify SHA256 → extract con `adm-zip` → run binary
- Auto-update check no bloqueante contra `latest.json`
- Spawn binary con `cwd` = directorio de extracción

### `packages/cli/package.json`
- Agregar dependencia `adm-zip: ^0.5.16`
- Fix `repository.url` → `git+https://github.com/ezeoli88/dash-agent.git`
- Agregar `homepage`, `bugs`

---

## Paso 4: Fix metadata placeholders

**Archivo:** `package.json` (root)
- `repository.url` → `git+https://github.com/ezeoli88/dash-agent.git`
- `homepage` → `https://github.com/ezeoli88/dash-agent#readme`
- `bugs.url` → `https://github.com/ezeoli88/dash-agent/issues`
- `author` → valor real

---

## Paso 5: GitHub Actions workflow

**Archivo nuevo:** `.github/workflows/release.yml`

Trigger: push de tag `v*`

**Job 1: `build`** (ubuntu-latest)
- Checkout + setup Bun + setup Node
- `npm ci && npm run build`
- Build 4 binarios (Bun cross-compiles desde Linux)
- Copiar `packages/dashboard/dist/` → `dist/{platform}/public/`
- Crear ZIPs: `dist/{platform}.zip` con binario + public/
- Generar `manifest.json` con SHA256 por plataforma
- Upload artifacts

**Job 2: `upload-r2`** (needs: build)
- Download artifacts
- Upload a R2 via rclone (S3-compatible):
  - `binaries/v{VERSION}/manifest.json`
  - `binaries/v{VERSION}/{platform}/agent-board.zip`
  - `latest.json`

**Job 3: `publish-npm`** (needs: upload-r2)
- `npm publish --access public` desde `packages/cli/`

### R2 bucket structure:
```
agent-board-releases/
  latest.json                              # {"tag":"v0.1.0","version":"0.1.0"}
  binaries/
    v0.1.0/
      manifest.json                        # SHA256 per platform
      linux-x64/agent-board.zip
      macos-x64/agent-board.zip
      macos-arm64/agent-board.zip
      win-x64/agent-board.zip
```

---

## Paso 6: Primer release

1. Hacer todos los cambios de Pasos 1-5
2. `npm run build` para verificar compilación
3. `git commit` + `git tag v0.1.0` + `git push --tags`
4. GitHub Actions: build → upload R2 → npm publish
5. Test: `npx agent-board`

---

## Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| sql.js WASM no embebido en binario | Testear temprano. Si falla, incluir `.wasm` en el ZIP o usar `sql-asm.js` |
| Cross-compilation arm64 | Testear en Mac real. Si falla, usar runner macOS ARM |
| Binario grande (~50-80MB ZIP) | Aceptable, se cachea. Mostrar progreso de descarga |

---

## Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `packages/server/src/index.ts` | Edit línea 72: static dir resolution |
| `package.json` (root) | Edit: build scripts + metadata |
| `packages/cli/package.json` | Edit: add adm-zip, fix URLs |
| `packages/cli/bin/cli.js` | Rewrite completo |
| `packages/cli/bin/download.js` | Nuevo |
| `.github/workflows/release.yml` | Nuevo |

---

## Verificación

1. `npm run build` pasa sin errores
2. `npm run build:binary:win-x64` genera `dist/win-x64/agent-board.exe`
3. Copiar `packages/dashboard/dist` → `dist/win-x64/public/`, ejecutar binario localmente → frontend carga en el browser
4. Push tag → GitHub Actions completa los 3 jobs
5. `npx agent-board` descarga, extrae, y levanta el server con frontend
