# Server Test Backlog P1

Objetivo: aumentar confianza de caja negra del backend con foco en rutas y servicios criticos.

## Criterio de P1
- Impacta flujo principal de task -> ejecucion -> review -> PR.
- Riesgo alto de regresion silenciosa.
- Cobertura actual baja o inexistente.

## Estado
- [x] `routes/setup.ts`: validaciones, settings, OAuth fallback/callback, status, disconnect.
- [x] `routes/data.ts`: export/import/delete, merge/no-merge, sanitizacion de columnas, confirmacion obligatoria.
- [x] `routes/tasks.ts`: cobertura reforzada en ramas de error y flujo principal (`71.76%` statements).
- [x] `services/git.service.ts`: cobertura reforzada en conflictos/merge/error paths (`68.33%` statements).
- [x] Suite `vitest` estable en CI local (`219` tests pasando).
- [ ] `services/repo.service.ts`: cubrir CRUD completo + persistencia de convenciones y patrones.
- [ ] `db/database.ts` y `db/migrations.ts`: smoke tests de inicializacion y migraciones.
- [ ] Definir gate de calidad para CI: minimo por archivo critico y threshold global realista.
- [ ] Optimizar performance de suite (`git.service.test.ts` tarda ~55s y domina el tiempo total).

## Regla de gate propuesta
- Archivos criticos (`routes/tasks.ts`, `services/task.service.ts`, `services/agent.service.ts`): `>= 70%` lineas.
- Resto del server: `>= 40%` lineas global.
- Todo PR debe ejecutar `vitest run --coverage` y fallar si rompe thresholds.

## Snapshot actual (13-02-2026)
- Cobertura global (`All files`): `33.84%` statements.
- Cobertura de `routes`: `61.58%` statements.
- Cobertura de `services`: `22.92%` statements.
