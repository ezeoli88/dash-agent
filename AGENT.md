# AGENT.md — Guía operativa del proyecto

Este documento define cómo debe trabajar cualquier agente (Copilot/Claude/u otros) en este repositorio.

## 0) Pensamiento crítico (obligatorio)

Antes de implementar cualquier solicitud:

- Evaluar tradeoffs: analizar pros y contras de la solución propuesta.
- Ser crítico: señalar riesgos, edge cases y alternativas mejores cuando existan.
- Aclarar ambigüedades: si falta contexto, pedir precisión antes de codificar.
- Cuestionar supuestos: advertir impactos en rendimiento, UX, seguridad o mantenibilidad.

Regla: no implementar automáticamente una idea si hay señales claras de que puede degradar el sistema.

## 1) Objetivo y alcance

- Proyecto: dashboard para gestión de tareas de un agente IA autónomo.
- Monorepo npm workspaces con paquetes en `packages/*`.
- Prioridad: cambios precisos, mínimos y verificables.

## 2) Jerarquía de verdad (evitar drift)

Cuando exista conflicto entre documentación y código, seguir este orden:

1. **Código runtime actual** (entrypoints, config, rutas, schemas)
2. **Scripts de `package.json`** (root y paquetes)
3. **Workflows CI/CD** (`.github/workflows/*`)
4. **Documentación narrativa** (`README.md`, `arquitectura-*.md`, planes)

Regla: no copiar afirmaciones de docs narrativas sin contrastarlas con código activo.

## 3) Estructura del monorepo

- `packages/server`: API backend (Bun + Express + sql.js)
- `packages/dashboard`: frontend (Vite + React + TanStack Router/Query + Zustand)
- `packages/shared`: tipos y schemas Zod compartidos
- `packages/cli`: wrapper npm (`ai-agent-board`) para descargar/ejecutar binario

## 4) Comandos oficiales (fuente: package.json)

### Root

- Instalar dependencias: `npm install`
- Desarrollo (server + dashboard): `npm run dev`
- Build completo: `npm run build`
- Build por paquete:
  - `npm run build:shared`
  - `npm run build:server`
  - `npm run build:dashboard`
- Dev por paquete:
  - `npm run dev:server`
  - `npm run dev:dashboard`

### Binarios

- `npm run build:binary:linux-x64`
- `npm run build:binary:macos-x64`
- `npm run build:binary:macos-arm64`
- `npm run build:binary:win-x64`

## 5) Configuración y puertos reales

Fuente de verdad: `packages/server/src/config.ts` y `packages/dashboard/vite.config.ts`.

- Backend (`PORT`): default `51767`
- Dashboard Vite: `3003`
- Proxy dev frontend → backend: `/api` → `http://localhost:51767`

Variables backend relevantes:

- `OPENAI_API_KEY` (opcional según flujo)
- `GITHUB_TOKEN` (opcional según flujo)
- `REPOS_BASE_DIR` (default `/var/repos`)
- `WORKTREES_DIR` (default `/tmp/agent-worktrees`)
- `DATABASE_PATH` (default `./data/agent-board.db`)
- `LOG_LEVEL` (`debug|info|warn|error`)

## 6) API y arquitectura operativa

- Prefijo API: todas las rutas bajo `/api/*`
- Entrypoint server: `packages/server/src/index.ts`
- Entrypoint binario: `packages/server/src/bin.ts`
- Rutas principales:
  - `/api/tasks`
  - `/api/repos`
  - `/api/setup`
  - `/api/data`
  - `/api/secrets`
- Health check: `/api/health`

Notas de runtime:

- El server intenta puerto disponible desde `PORT` en rango incremental.
- En modo binario puede habilitar auth de startup token.
- En producción/binario sirve frontend estático con fallback SPA.

## 7) Estados de tarea y compatibilidad legacy

Fuente de verdad: `packages/shared/src/schemas/task.schema.ts`.

- Estados actuales (flujo nuevo): `draft`, `refining`, `pending_approval`, `approved`, `coding`, `plan_review`, `review`, `merge_conflicts`, `changes_requested`, `done`, `failed`, `canceled`
- Estados legacy soportados: `backlog`, `planning`, `in_progress`, `awaiting_review`, `pr_created`

Regla: cualquier cambio de flujo/estado debe actualizar primero schemas compartidos y luego backend/frontend.

## 8) Reglas de trabajo del agente

### Calidad y validación

- Corregir causa raíz, no solo síntomas.
- Mantener cambios acotados al pedido.
- Evitar modificar áreas no relacionadas.
- Verificar compilación con `npm run build` cuando el cambio lo amerite.

### Procesos y ejecución

- No levantar servidores de desarrollo (`npm run dev`) salvo pedido explícito del usuario.
- Si se inició un proceso largo para pruebas, cerrarlo antes de finalizar.
- Preferir comandos de build/lint/tests específicos del área tocada antes de validar todo el monorepo.

### Documentación

- Si una doc contradice código actual, registrar el drift y priorizar runtime.
- Al cambiar comportamiento público, actualizar documentación mínima necesaria.

## 9) Guía de release (resumen operativo)

Fuente de verdad: `.github/workflows/release.yml` y `packages/cli/package.json`.

Flujo esperado de release:

1. Bump de versión en `packages/cli/package.json`
2. Commit del bump
3. Tag semver `vX.Y.Z` y push de tag
4. Workflow `release.yml`:
   - build de binarios multi-plataforma
   - upload de artefactos + manifest a R2
   - publish npm del paquete `ai-agent-board`

Regla: la versión de publicación npm es la de `packages/cli/package.json`.

## 10) Archivos de referencia rápida

- Root scripts: `package.json`
- Server config/runtime: `packages/server/src/config.ts`, `packages/server/src/index.ts`
- Frontend dev config: `packages/dashboard/vite.config.ts`
- Task schema: `packages/shared/src/schemas/task.schema.ts`
- Release pipeline: `.github/workflows/release.yml`

## 11) Señales de documentación potencialmente desactualizada

Usar con cautela y siempre contrastar con runtime:

- `packages/dashboard/README.md`
- `packages/dashboard/frontend-plan.md`
- `packages/dashboard/docs/test-plan.md`

---

Si este documento entra en conflicto con runtime actual, actualizar `AGENT.md` en el mismo PR que introduce el cambio de comportamiento.
