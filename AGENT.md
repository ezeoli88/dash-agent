# AGENT.md — Guía operativa del proyecto

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

- `packages/server-rs`: API backend (Rust + Axum + rusqlite)
- `packages/dashboard`: frontend (Vite + React + TanStack Router/Query + Zustand)
- `packages/shared`: tipos y schemas Zod compartidos
- `packages/cli`: wrapper npm (`ai-agent-board`) para descargar/ejecutar binario

Si este documento entra en conflicto con runtime actual, actualizar `AGENT.md` en el mismo PR que introduce el cambio de comportamiento.
