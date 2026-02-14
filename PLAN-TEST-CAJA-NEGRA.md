# Plan de Testeo Caja Negra (Server)

Fecha de corte: 13 de febrero de 2026.

## Concepto

Queremos que el backend deje de ser una caja negra opaca y pase a ser una caja negra confiable:
- Si los tests pasan, tenemos alta confianza en contratos de API, flujos criticos y manejo de errores.
- La confianza no depende de revisar manualmente cada cambio generado por agentes.
- El foco es validar comportamiento observable (entradas/salidas), no implementacion interna.

## Que estamos haciendo

Estamos construyendo una estrategia por capas para el `packages/server`:
1. Tests de rutas (contrato HTTP + validaciones + codigos de estado).
2. Tests de servicios criticos (reglas de negocio y edge cases).
3. Coverage como guardrail de regresiones.
4. Gate de calidad en CI para que no entren regresiones silenciosas.

## Lo que ya fue hecho

- Base de testeo en server consolidada con Vitest + Supertest.
- Suite actual estable: `310` tests pasando.
- Nuevos tests P1 implementados:
  - `packages/server/src/routes/setup.route.test.ts`
  - `packages/server/src/routes/data.route.test.ts`
  - `packages/server/src/routes/tasks.route.test.ts`
  - `packages/server/src/services/git.service.test.ts`
  - `packages/server/src/services/repo.service.test.ts`
  - `packages/server/src/db/database.test.ts`
  - `packages/server/src/db/migrations.test.ts`
- Cobertura mejorada en rutas de alto riesgo de setup/export-import:
  - `routes/data.ts`: `89.68%` statements.
  - `routes/setup.ts`: `77.27%` statements.
- Cobertura reforzada en flujo principal y git:
  - `routes/tasks.ts`: `71.76%` statements.
  - `services/task.service.ts`: `80.00%` statements.
  - `services/git.service.ts`: `73.66%` statements.
  - `services/repo.service.ts`: `100.00%` statements.
- Cobertura global actual server:
  - `All files`: `39.33%` statements (`40.03%` lineas).
  - `services/agent.service.ts`: `21.53%` statements (`21.87%` lineas).
- Verificacion tecnica ejecutada:
  - `vitest run --config vitest.config.ts`
  - `vitest run --config vitest.config.ts --coverage`
  - `tsc -p tsconfig.json --noEmit`

## Lo que falta

Pendiente post Fase D:
- Optimizar tiempo de suite en `services/git.service.test.ts` (actualmente ~49s, es el cuello de botella).
- Cobertura dedicada para `services/agent.service.ts` (baseline: `21.87%` lineas, objetivo futuro: `>= 50%`).
- Subir threshold global progresivamente (40% -> 50%) a medida que se cubren mas servicios.

## Estrategia de ejecucion (fases)

1. **Fase A (completada):** estabilizar suite y cubrir rutas `setup` + `data`.
2. **Fase B (completada):** reforzar `tasks` y `git.service` (riesgo funcional alto).
3. **Fase C (completada):** cubrir `repo.service` y capa DB/migraciones.
4. **Fase D (completada, 13-feb-2026):**
   - **Parte 1 - Global threshold:** `>= 40%` lineas configurado en `vitest.config.ts`.
   - **Parte 2 - Per-file gates:** script `scripts/check-coverage.mjs` valida 4 archivos maduros.
   - **Parte 3 - CI workflow:** `.github/workflows/test.yml` corre en PR/push a main.
   - Comando local: `npm run test:coverage:gate` ejecuta todo junto.

## Criterio de terminado

Consideramos esta etapa cerrada cuando:
- ~~Los flujos criticos task -> ejecucion -> review -> PR tienen cobertura util de caja negra.~~ [OK]
- ~~Las rutas y servicios P1 tienen tests de edge cases y errores.~~ [OK]
- ~~CI falla automaticamente si baja la cobertura acordada.~~ [OK]

**Etapa cerrada el 13 de febrero de 2026.**

## Gates activos en CI

- Global server: `>= 40%` lineas (actual: `40.03%`).
- Per-file gates (via `scripts/check-coverage.mjs`):
  - `routes/tasks.ts`: `>= 70%` lineas (actual: `71.76%`).
  - `services/task.service.ts`: `>= 70%` lineas (actual: `80.85%`).
  - `services/git.service.ts`: `>= 70%` lineas (actual: `73.64%`).
  - `services/repo.service.ts`: `>= 90%` lineas (actual: `100%`).
- `services/agent.service.ts` excluido (baseline: `21.87%` lineas).
- Workflow: `.github/workflows/test.yml` en PR y push a main.
- Comando local: `npm run test:coverage:gate`.

