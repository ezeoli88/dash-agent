# Plan de Implementacion: MCP Server para Agent Board (Flujo Directo)

## Decisiones cerradas (confirmadas)

1. Flujo oficial MCP: **directo** (sin spec).
2. MVP incluye: **crear/ejecutar/review/PR lifecycle**.
3. Validaciones MCP: **mismas reglas que rutas HTTP**.
4. Repos en MVP: **listar + crear/agregar repo**.
5. Spec tools: **fuera de scope** (`generate_spec`, `approve_spec`, etc.).
6. Auth: v1 con token efimero de startup, API keys persistentes en v2.
7. Respuestas grandes: **sin truncar**.
8. Estado cancelado: **estandarizar a `canceled`**.

---

## 1. Objetivo

Exponer un endpoint MCP embebido en el backend Express para que clientes MCP (Claude Code, Codex, Copilot, etc.) puedan operar Agent Board por tools:

- Descubrir/agregar repositorios
- Crear tareas
- Ejecutar agente
- Revisar cambios
- Aprobar PR o pedir cambios
- Marcar PR mergeado/cerrado

Sin flujo de spec intermedio.

---

## 2. Arquitectura

### 2.1 Decision de despliegue

MCP embebido en el server Express actual.

- Endpoint: `POST /api/mcp`
- Mismo puerto/proceso que REST
- Mismos servicios (`taskService`, `agentService`, `repoService`, etc.)

### 2.2 Transport

- Primario: Streamable HTTP
- `stdio`: fuera de scope v1

### 2.3 Estructura propuesta

```text
src/mcp/
  index.ts                 # mount en Express
  server.ts                # createMcpServer + registro
  context.ts               # request context/helpers compartidos
  tools/
    repo-tools.ts
    task-tools.ts
    workflow-tools.ts
    review-tools.ts
    status-tools.ts
  resources/
    task-resources.ts
    repo-resources.ts
```

---

## 3. Contrato de flujo (v1)

Flujo oficial por MCP:

1. `list_repositories` o `add_repository`
2. `create_task`
3. `start_task` (o `execute_task` en estados permitidos)
4. `get_task` + `get_task_changes`
5. `approve_changes` o `request_changes`
6. Si PR mergeado/cerrado externamente: `mark_pr_merged` o `mark_pr_closed`

No se implementan tools de spec ni plan approval en v1.

---

## 4. Regla clave: MCP debe replicar rutas

No usar servicios "raw" sin validar precondiciones.  
Cada tool debe reproducir exactamente las validaciones de estado y comportamiento de las rutas en `src/routes/tasks.ts`.

Ejemplos:

- `approve_changes` acepta `awaiting_review` o `review` (como ruta), y maneja errores mapeados de PR.
- `request_changes` acepta `pr_created` o `review` (como ruta), aunque `agentService` internamente sea mas estricto.
- `cancel_task` soporta caso especial de `refining` y fallback cuando no hay agente activo.

---

## 5. Tools MCP (v1)

## 5.1 Repositories

### `list_repositories`
- Equivalente: `GET /api/repos`
- Output: lista de repos registrados

### `add_repository`
- Equivalente v1: `POST /api/repos/local/add` (solo local)
- Input minimo:
  - `name`
  - `path` (local)
  - `default_branch?`
  - `remote_url?` (si local)
- Nota: necesaria porque `RepoService` es en memoria

### `get_repository`
- Equivalente: `GET /api/repos/:id`

---

## 5.2 Tasks (core)

### `create_task`
- Equivalente: `POST /api/tasks`
- Validacion: `CreateTaskSchema`
- Input:
  - `repository_id` (uuid)
  - `user_input`
  - `agent_type?`
  - `agent_model?`
  - `target_branch?`

### `list_tasks`
- Equivalente: `GET /api/tasks`
- Filtros:
  - `repository_id?`
  - `status?` (array)

### `get_task`
- Equivalente: `GET /api/tasks/:id`

### `update_task`
- Equivalente: `PATCH /api/tasks/:id`

### `delete_task`
- Equivalente: `DELETE /api/tasks/:id`

---

## 5.3 Workflow execution

### `start_task`
- Equivalente: `POST /api/tasks/:id/start`
- Estados validos: `draft`, `failed`

### `execute_task`
- Equivalente: `POST /api/tasks/:id/execute`
- Estados validos: `backlog`, `approved`, `failed`, `changes_requested`

### `send_feedback`
- Equivalente: `POST /api/tasks/:id/feedback`
- Debe soportar:
  - `feedback_sent` si agente corriendo
  - `agent_resumed` si estaba detenido en estado no terminal

### `extend_task_timeout`
- Equivalente: `POST /api/tasks/:id/extend`

### `cancel_task`
- Equivalente: `POST /api/tasks/:id/cancel`

---

## 5.4 Review y PR lifecycle

### `get_task_changes`
- Equivalente: `GET /api/tasks/:id/changes`
- Sin truncamiento en v1 (decision tomada)

### `approve_changes`
- Equivalente: `POST /api/tasks/:id/approve`

### `request_changes`
- Equivalente: `POST /api/tasks/:id/request-changes`
- Input: `feedback`

### `mark_pr_merged`
- Equivalente: `POST /api/tasks/:id/pr-merged`

### `mark_pr_closed`
- Equivalente: `POST /api/tasks/:id/pr-closed`

---

## 5.5 Estado/setup

### `get_setup_status`
- Combina:
  - `getAllSecretsStatus()` (AI/GitHub/GitLab)
  - `detectInstalledAgents()`
  - `isOAuthConfigured()`

---

## 6. Resources MCP (read-only)

### `agentboard://status`
- Setup global y conectividad

### `agentboard://tasks/{taskId}`
- Task completa

### `agentboard://tasks/{taskId}/changes`
- Diff y archivos modificados

### `agentboard://repos/{repoId}`
- Metadata de repo

---

## 7. Autenticacion

## v1
- Reusar `requireAuth` para `/api/mcp`
- Token efimero de startup (igual que REST)

## v2 (pendiente)
- API keys persistentes para clientes MCP

---

## 8. Estado `canceled` (fix obligatorio)

Estandarizar en todo el backend el estado `canceled` (no `cancelled`).

Acciones minimas:

1. Corregir queries en `src/services/repo.service.ts`:
   - cambiar `cancelled` -> `canceled`
2. Revisar tests/documentacion para consistencia
3. Verificar conteo de tareas activas luego del cambio

---

## 9. Implementacion por fases

## Fase 1 (MVP usable end-to-end)

Objetivo: desde cliente MCP poder completar ciclo real hasta PR.

1. Instalar `@modelcontextprotocol/sdk` en `@dash-agent/server`
2. Crear `src/mcp/server.ts` y `src/mcp/index.ts`
3. Montar `mountMcpRoutes(app)` en `src/index.ts`
4. Implementar tools:
   - `list_repositories`, `add_repository`, `get_repository`
   - `create_task`, `list_tasks`, `get_task`, `update_task`, `delete_task`
   - `start_task`, `execute_task`, `send_feedback`, `extend_task_timeout`, `cancel_task`
   - `get_task_changes`, `approve_changes`, `request_changes`, `mark_pr_merged`, `mark_pr_closed`
   - `get_setup_status`
5. Implementar resources base (`status`, `tasks/{id}`, `tasks/{id}/changes`, `repos/{id}`)
6. Aplicar fix `canceled`
7. Tests unitarios + integracion MCP basica
8. Build y smoke test manual con Claude Code

Criterio de exito:
- Cliente MCP crea repo (si no existe), crea task, ejecuta agente, revisa cambios y aprueba PR sin usar REST directo.

## Fase 2 (hardening)

1. Mejorar errores tipados y mensajes accionables
2. Paginacion opcional en `list_tasks` (sin truncar diffs)
3. Telemetria de tools MCP (latencia, errores)
4. Documentacion de configuracion por cliente MCP

## Fase 3 (v2)

1. API keys persistentes para MCP
2. (Opcional) notifications MCP server-initiated
3. (Opcional) stdio transport

---

## 10. Testing

Cobertura minima por tool:

- validacion de input
- precondiciones de estado
- happy path
- errores de servicio

Suites:

```text
src/mcp/__tests__/
  repo-tools.test.ts
  task-tools.test.ts
  workflow-tools.test.ts
  review-tools.test.ts
  status-tools.test.ts
  mcp-integration.test.ts
```

Comandos:

- `npm run build`
- `npm run test:run`

---

## 11. Riesgos reales y mitigaciones

1. Divergencia MCP vs REST en reglas de estado  
Mitigacion: tests de paridad por endpoint/tool y reutilizacion de helpers comunes.

2. `RepoService` en memoria deja MVP inutil tras restart  
Mitigacion: `add_repository` en MVP + mensaje claro cuando no hay repos.

3. Diffs muy grandes (sin truncamiento) pueden saturar cliente  
Mitigacion: mantener sin truncar en v1, pero agregar paginacion/preview opcional en v2.

4. Token efimero dificulta reconexion de clientes MCP  
Mitigacion: API keys persistentes en v2.

---

## 12. Fuera de scope v1

- Alta remota de repos (via `POST /api/repos` con URL GitHub/GitLab)
- Tools de spec (`generate_spec`, `regenerate_spec`, `approve_spec`, `edit_spec`)
- `approve_plan`
- stdio transport
- API keys persistentes
