# Plan de Testeo Caja Negra (Dashboard Frontend)

Fecha de corte: 13 de febrero de 2026.

## Concepto

Queremos que `packages/dashboard` sea una caja negra confiable:
- Si los tests pasan, tenemos alta confianza en los flujos criticos visibles para usuario.
- La confianza no depende de inspeccion manual de cada cambio.
- El foco es comportamiento observable (UI, navegacion, llamadas API, estados de error), no implementacion interna.

## Diagnostico actual (real)

- No existe framework de tests activo en el dashboard (sin scripts de test/coverage en `packages/dashboard/package.json`).
- CI actual valida solo server (`.github/workflows/test.yml`), sin gate de frontend.
- El plan E2E historico de dashboard esta desalineado con rutas actuales (ejemplo: menciona `/tasks`, la app usa `/board`, `/repos`, `/diff/$taskId`).
- Ultimo reporte TestSprite: `40%` de casos pasando (`12/30`), con brechas fuertes en SSE, errores API y fixtures de estados de tarea.

## Flujos criticos a cubrir (P0)

1. Boot de app y guardas de navegacion:
   - Inicializacion de auth token en URL.
   - Pre-check de repos antes de montar React.
   - Redireccion a `/repos` en ausencia de repos o error.
   - Deteccion de restart de server (`X-Server-ID`) y reset de estado.
2. Seleccion de repositorio y contexto activo:
   - Escaneo local, alta repo, fallback por conflicto (repo ya existente), seleccion en store y navegacion.
3. Creacion de tarea (draft):
   - Validaciones, payload correcto, error handling, persistencia de ultimo agente/modelo.
4. Flujo board:
   - Render por columnas segun estado.
   - Drag and drop de `draft` a `inProgress` dispara `start`.
5. Matriz de acciones por estado:
   - Botones correctos por status.
   - Confirmaciones destructivas.
   - Mutaciones y invalidaciones de cache.
   - Navegacion post delete.
6. Logs/SSE/chat:
   - Eventos `log`, `status`, `timeout_warning`, `awaiting_review`, `complete`, `error`, `pr_comment`, `chat_message`, `tool_activity`.
   - Reconexion, corte por evento terminal, toasts/notificaciones, invalidacion de queries.
7. Diff y review:
   - Carga de cambios, estados empty/error.
   - Request changes, mark merged/closed.
   - Open editor / resolve conflicts (incluye 409).
8. Superficie de errores API:
   - Mapeo de `ApiClientError` (status/code/details), 204, red/network errors, y feedback visual en UI.

## Lo que ya fue hecho

- **Fase A (completada):** Infra de testeo.
  - Vitest + RTL + MSW v2 + jsdom configurados.
  - Scripts `test`, `test:run`, `test:coverage`, `test:coverage:gate` en `package.json`.
  - `vitest.config.ts` con v8 coverage, excluye `components/ui/**`.
  - Utilidades: `renderWithProviders`, `createTestQueryClient`, `MockEventSource`, `resetAllStores`, fixtures de task.
- **Fase B (completada):** Cobertura P0 base.
  - `main.test.ts` (9 tests, 100% lines): boot, redirects, restart detection.
  - `router.test.tsx` (7 tests, 100% lines): guardas de repos, redirect /setup.
  - `repos-page.test.tsx` (11 tests, 100% lines): scan, seleccion, 409 fallback.
  - `create-task-dialog.test.tsx` (9 tests, 83.67% lines): validaciones, payload, error.
  - `task-actions.test.tsx` (24 tests, 85.05% lines): matriz de acciones, mutaciones, confirmaciones.
  - `board-view-dnd.test.tsx` (5 tests): DnD real via mock @dnd-kit, start on drag.
  - `use-board-tasks.test.ts` (11 tests, 100% lines): agrupacion por columnas.
- **Fase C (completada):** Cobertura P0 avanzada.
  - `use-task-sse.test.ts` (20 tests, 93.18% lines): 9 tipos de evento SSE, reconexion, terminal, supresion CANCELLED.
  - `use-task-chat.test.ts` (11 tests, 100% lines): chat/tool aggregation, tool_use→tool_result merge.
  - `task-logs.test.tsx` (14 tests, 94.44% lines): empty states, toolbar, SSE callbacks, toasts, feedback.
  - `task-diff.test.tsx` (7 tests, 100% lines): loading, error 500, error 409, empty, render datos, auto-select, summary fallback.
  - `use-task-changes.test.ts` (5 tests, 100% lines): fetch, loading, 404, 500, disabled.
  - `api-client.test.ts` (20 tests, 58% lines): HTTP errors, 204, network, restart detection, auth, query params.
  - Contrato de mocks alineado con `TaskChangesResponseSchema` (files/path/diff/summary).
- **Fase D (completada, 13-feb-2026):** Gates de calidad en CI.
  - **Parte 1 - Global threshold:** `>= 20%` lineas configurado en `vitest.config.ts`.
  - **Parte 2 - Per-file gates:** script `scripts/check-coverage.mjs` valida 5 archivos maduros.
  - **Parte 3 - CI workflow:** `.github/workflows/test.yml` job `test-dashboard` en PR/push a main.
  - Comando local: `npm run test:coverage:gate` ejecuta todo junto.

## Estrategia de ejecucion (fases)

1. **Fase A - Fundacion de testeo (infra):** [completada]
2. **Fase B - Cobertura P0 (rutas + hooks + stores):** [completada]
3. **Fase C - Cobertura P0 avanzada (tiempo real y errores):** [completada]
4. **Fase D - Gates de calidad en CI:** [completada]

## Gate propuesto para CI (iterativo y realista)

- Scope de coverage (desde Fase A):
  - Excluir `src/components/ui/**` del reporte/gate (wrappers de shadcn sin logica de negocio propia).
  - Mantener dentro del scope todo lo que tenga logica de producto: rutas, hooks, stores, features, servicios de API y componentes de flujo.
- Threshold global por fase (sobre el scope excluyendo `components/ui`):
  - Cierre Fase B: `>= 12%` lineas. [OK]
  - Cierre Fase C (objetivo minimo): `>= 20%` lineas. [OK]
  - Etapa siguiente (post C, con mas flujos cubiertos): `>= 30%` lineas.
- Regla de evolucion:
  - No bajar threshold global una vez publicado en CI.
  - Subir en incrementos de `+5%` cuando se cierre una fase con flujos P0 estables.
- Regla complementaria recomendada:
  - Cuando un archivo/flujo quede "maduro" (tests estables + ownership claro), agregarle gate por archivo para evitar regresiones locales.
- PR/push a `main`:
  - Debe correr test + coverage de server y dashboard.

## Criterio de terminado

Consideramos cerrada esta etapa cuando:
- ~~Los flujos P0 del frontend tienen cobertura util de caja negra.~~ [OK]
- ~~Los errores criticos (auth, repos, SSE, actions, diff) tienen pruebas de regresion.~~ [OK]
- ~~CI falla automaticamente ante regresion de coverage o de comportamientos P0.~~ [OK]

**Etapa cerrada el 13 de febrero de 2026.**

## Gates activos en CI

- Global dashboard: `>= 20%` lineas (actual: `23.37%`).
- Per-file gates (via `scripts/check-coverage.mjs`):
  - `features/tasks/components/task-diff.tsx`: `>= 90%` lineas (actual: `100%`).
  - `features/tasks/hooks/use-task-changes.ts`: `>= 90%` lineas (actual: `100%`).
  - `features/tasks/hooks/use-task-chat.ts`: `>= 90%` lineas (actual: `100%`).
  - `features/tasks/hooks/use-task-sse.ts`: `>= 85%` lineas (actual: `93.18%`).
  - `lib/api-client.ts`: `>= 50%` lineas (actual: `58%`).
- Workflow: `.github/workflows/test.yml` job `test-dashboard` en PR y push a main.
- Comando local: `npm run test:coverage:gate`.

## Riesgos y decisiones

- ~~Riesgo actual mayor: no existe gate frontend en CI.~~ [RESUELTO]
- Riesgo secundario: plan historico de E2E no refleja rutas/flujo actuales.
- Decision tecnica: primero estabilizar tests de integracion (Vitest + MSW), luego E2E de smoke con fixtures controlados.
- Decision de coverage: excluir `src/components/ui/**` para que el gate mida logica critica real y no wrappers genericos.

## Pendiente post cierre

- Subir threshold global progresivamente (20% → 25% → 30%) a medida que se cubren mas flujos.
- Agregar per-file gates para archivos que maduren (task-actions, create-task-dialog, repos-page).
- E2E de smoke con fixtures controlados (post estabilizacion de integracion).
