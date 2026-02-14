# AGENT.md - @dash-agent/server

## Scope
Este documento aplica al paquete `packages/server`.

## Objetivo del proyecto
Backend API para Agent Board: gestiona tareas de desarrollo, ejecuta agentes de codigo (CLI o API), mantiene worktrees Git aislados, y automatiza ciclo de PR/MR con seguimiento por SSE.

## Stack tecnico
- TypeScript estricto (`tsconfig.json` con `strict` y reglas adicionales).
- Node.js ESM (`"type": "module"`), minimo `node >= 18`.
- Express + CORS.
- SQL.js (archivo SQLite en disco) para `tasks`, `task_logs`, `user_secrets`, `user_settings`.
- Vitest para tests unitarios/ruta.
- Runtime de desarrollo: Bun (`npm run dev` usa `bun run --watch`).

## Estructura principal
- `src/index.ts`: bootstrap del servidor, CORS, auth middleware, rutas, healthcheck, shutdown.
- `src/routes/*.ts`: API HTTP (`tasks`, `repos`, `setup`, `secrets`, `data`).
- `src/services/*.ts`: logica de dominio (agentes, git, repos, secretos, PM/Dev workflow).
- `src/agent/*.ts`: runners de agente, prompting, tool execution, whitelist de comandos.
- `src/db/*.ts`: inicializacion DB y migraciones.
- `src/utils/*.ts`: logger estructurado, manejo de errores, SSE emitter, process killer.
- `scripts/check-coverage.mjs`: gate de cobertura por archivo.
- `dist/`: build output (no editar manualmente).

## Flujos funcionales clave
1. Flujo nuevo PM + Dev Agent:
   - `draft -> refining -> pending_approval -> approved -> planning/coding -> awaiting_review/review -> pr_created -> done`
2. Flujo legado directo:
   - `backlog -> planning -> in_progress -> awaiting_review -> pr_created -> done`
3. Cambios solicitados:
   - `pr_created/review -> changes_requested -> execute (resume)`
4. Conflictos de merge:
   - `merge_conflicts -> resolve-conflicts -> approved -> push/create PR`

Notas:
- `RepoService` es en memoria (ephemeral). `TaskService` persiste en DB.
- `AgentService` controla ciclo de vida de runners, timeouts, SSE, commits y PR/MR.
- `GitService` usa bare repos + worktrees por task y maneja casos Windows (locks/EBUSY).

## API y eventos que no se deben romper
- Base API: `/api/*`
- Health: `GET /api/health`
- SSE: `GET /api/tasks/:id/logs`
- Eventos SSE usados por frontend: `log`, `status`, `timeout_warning`, `awaiting_review`, `complete`, `error`, `chat_message`, `tool_activity`

## Configuracion y secretos
- Variables en `.env.example`: `OPENAI_API_KEY`, `GITHUB_TOKEN`, `REPOS_BASE_DIR`, `WORKTREES_DIR`, `PORT`, `DATABASE_PATH`, `LOG_LEVEL`.
- Secretos reales se guardan cifrados en `user_secrets` via `secrets.service.ts`.
- No hardcodear tokens ni exponer secretos en logs/respuestas.

## Convenciones de codigo
- Mantener estilo existente: imports ESM con sufijo `.js` en imports internos.
- Preferir validacion con Zod en rutas.
- Usar `createLogger(...)` y logs estructurados JSON.
- Manejar errores con respuestas consistentes (`error`, `message`, opcional `details`).
- Evitar cambios amplios: preferir cambios minimos y locales.
- Si se toca schema DB, agregar migracion nueva en `src/db/migrations.ts` (nunca reescribir versiones previas).
- Mantener compatibilidad Windows/Linux al ejecutar comandos o manipular paths.

## Comandos de trabajo
- Desarrollo: `npm run dev`
- Build: `npm run build`
- Tests: `npm run test:run`
- Cobertura: `npm run test:coverage`
- Gate cobertura: `npm run test:coverage:gate`

## Calidad esperada al contribuir
- Si cambias rutas/servicios criticos, agregar o ajustar tests en `src/**/*.test.ts`.
- Verificar que no se rompan transiciones de estado de tareas.
- Verificar que no se rompan eventos SSE esperados por frontend.
- No editar artefactos generados (`dist`, `coverage`) salvo que la tarea lo requiera explicitamente.

## Checklist rapido antes de cerrar una tarea
1. `npm run build` sin errores.
2. Tests relevantes pasando (`npm run test:run` o subset).
3. Si hubo cambios importantes en rutas/servicios: correr cobertura.
4. Revisar que no haya secretos ni datos sensibles en cambios.
5. Documentar cambios de flujo/estado si aplica.
