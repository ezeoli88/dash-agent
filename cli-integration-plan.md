# Plan: Multi-Agente CLI (estilo Vibe Kanban)

## Resumen
Reemplazar el agente custom (LLM provider + tool executor) por ejecución directa de CLIs de coding (Claude Code, Codex, Copilot, Gemini). Cada CLI ya maneja su propia autenticación, herramientas y loop agéntico. El dashboard solo necesita detectar CLIs instalados, ejecutarlos en modo headless, y mostrar su output.

## Ventajas vs enfoque anterior
- Sin API keys ni OAuth — cada CLI usa su propia autenticación existente
- Sin traducción de formatos de tool calling
- Cada CLI es más potente que nuestro agent loop custom
- Mucho menos código nuevo

---

## Fase 1: Backend — Detección de CLIs instalados ✅ COMPLETADA

### 1A. Servicio de detección de agentes ✅
**Creado:** `packages/server/src/services/agent-detection.service.ts`

Detectar CLIs ejecutando `<cli> --version` (o equivalente) y parsear la respuesta:

```typescript
interface DetectedAgent {
  id: string;           // 'claude-code' | 'codex' | 'copilot' | 'gemini'
  name: string;         // 'Claude Code' | 'Codex' | 'GitHub Copilot' | 'Gemini CLI'
  installed: boolean;
  version: string | null;
  authenticated: boolean; // intentar un comando mínimo para verificar auth
  models: AgentModel[];   // modelos disponibles para este CLI
}

interface AgentModel {
  id: string;          // 'opus', 'sonnet', 'max', 'default', etc.
  name: string;        // display name
  description?: string;
}
```

Detección por CLI:
| CLI | Comando detección | Verificar auth | Modelos conocidos |
|-----|-------------------|----------------|-------------------|
| Claude Code | `claude --version` | `claude -p "hi" --output-format json --max-turns 1` | opus, sonnet, haiku (según suscripción) |
| Codex | `codex --version` | `codex exec "hi" --json` (rápido) | o3, o4-mini, default |
| Copilot | `copilot --version` | `copilot -p "hi"` | default |
| Gemini | `gemini --version` | `gemini --non-interactive "hi"` | default, flash, pro |

### 1B. Endpoint para listar agentes detectados ✅
**Modificado:** `packages/server/src/routes/setup.ts`
- `GET /setup/agents` — retorna lista de `DetectedAgent[]`
- Cachear resultado por 5 minutos (no re-detectar en cada request)

### 1C. Schemas compartidos ✅
**Creado:** `packages/shared/src/schemas/agent.schema.ts`
- Nuevo `agent.schema.ts`:
  - `AgentTypeSchema = z.enum(['claude-code', 'codex', 'copilot', 'gemini'])`
  - `DetectedAgentSchema`, `AgentModelSchema`
  - `DetectedAgentsResponseSchema`

---

## Fase 2: Backend — CLI Agent Runner ✅ COMPLETADA

### 2A. Interface común de Agent Runner ✅
**Creado:** `packages/server/src/agent/types.ts`

Extraer interface de `AgentRunner`:
```typescript
interface IAgentRunner {
  run(): Promise<AgentRunResult>;
  addFeedback(message: string): void;
  cancel(): void;
  getIsRunning(): boolean;
}
```

### 2B. CLI Agent Runner ✅
**Creado:** `packages/server/src/agent/cli-runner.ts`

Implementa `IAgentRunner` ejecutando un CLI como child process:

```typescript
class CLIAgentRunner implements IAgentRunner {
  private process: ChildProcess | null = null;

  constructor(options: CLIAgentRunnerOptions) {
    // options incluye: agentType, model, workspacePath, task, prompt, onLog, onStatusChange
  }

  async run(): Promise<AgentRunResult> {
    // 1. Construir el comando según el agentType
    // 2. Spawn child process con cwd = workspacePath
    // 3. Parsear stdout (stream-json / JSONL) y emitir logs
    // 4. Detectar completitud y retornar resultado
  }

  cancel(): void {
    this.process?.kill('SIGTERM');
  }
}
```

Comandos por CLI:

**Claude Code:**
```bash
claude -p "<prompt>" \
  --output-format stream-json \
  --verbose \
  --allowedTools "Read,Edit,Bash,Write" \
  --model <model>
```
Parsear: cada línea es JSON con `type` field. Buscar `type: "result"` para completitud.

**Codex:**
```bash
codex exec "<prompt>" \
  --json \
  --full-auto \
  -m <model>
```
Parsear: JSONL con event types `turn.started`, `turn.completed`, `item.*`

**Copilot:**
```bash
copilot -p "<prompt>" \
  --allow-all-tools
```
Capturar stdout como texto plano.

**Gemini:**
```bash
gemini --non-interactive "<prompt>" \
  --output-format ndjson \
  --yolo
```
Parsear: NDJSON con eventos.

### 2C. Prompt builder para CLIs ✅
**Creado:** `packages/server/src/agent/cli-prompts.ts`

Construir el prompt que se pasa al CLI basándose en la tarea:
```typescript
function buildCLIPrompt(task: Task): string {
  // Incluir: título, spec/descripción, branch name, build command, contexto
  // Similar a lo que hace getSystemPrompt() + getPlanningPrompt() pero como un solo prompt
}
```

### 2D. Factory de Agent Runners ✅
**Modificado:** `packages/server/src/agent/index.ts`

```typescript
function createRunner(options: RunnerOptions): IAgentRunner {
  if (options.agentType) {
    return new CLIAgentRunner(options);
  }
  // Fallback: runner legacy para backward compat
  return new AgentRunner(options);
}
```

### 2E. Actualizar AgentService para usar factory ✅
**Modificado:** `packages/server/src/services/agent.service.ts`
- Cambiado `createAgentRunner(runnerOptions)` → `createRunner(runnerOptions)`
- Agregado `agentType` y `agentModel` a las opciones del runner
- Lee configuración de agente desde la tarea (`task.agent_type`, `task.agent_model`)
- ActiveAgent ahora usa `IAgentRunner` en vez de `AgentRunner`

---

## Fase 3: Backend — Configuración de agente por defecto ✅ COMPLETADA

### 3A. Tabla de settings ✅
**Modificado:** `packages/server/src/db/migrations.ts`
- Nueva migración (6): tabla `user_settings`
  ```sql
  CREATE TABLE user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
  ```

### 3B. Settings service ✅
**Creado:** `packages/server/src/services/settings.service.ts`
- `getSetting(key)`, `setSetting(key, value)`
- Keys: `default_agent_type`, `default_agent_model`

### 3C. Endpoints de settings ✅
**Modificado:** `packages/server/src/routes/setup.ts`
- `GET /setup/settings` — retorna settings actuales
- `PATCH /setup/settings` — actualiza settings (agent default, modelo)

### 3D. Agregar agent_type y agent_model a tareas (opcional override) ✅
**Modificado:** `packages/server/src/db/migrations.ts`
- Nueva migración (7): agregar columnas a `tasks`
  ```sql
  ALTER TABLE tasks ADD COLUMN agent_type TEXT;
  ALTER TABLE tasks ADD COLUMN agent_model TEXT;
  ```

**Modificado:** `packages/server/src/services/task.service.ts`
- Agregado `agent_type` y `agent_model` a columnas, whitelist de update, Task interface, y rowToTask()

**Modificado:** `packages/shared/src/schemas/task.schema.ts`
- Agregado `agent_type` y `agent_model` a TaskSchema, CreateTaskSchema, y UpdateTaskSchema

---

## Fase 4: Frontend — Modal de selección de agente ✅ COMPLETADA

### 4A. Hook para detectar agentes ✅
**Creado:** `packages/dashboard/src/features/setup/hooks/use-detected-agents.ts` + `use-settings.ts`
- `useDetectedAgents()`: query a `GET /setup/agents`
- Retorna lista de agentes con estado de instalación y auth

### 4B. Componente de selección de agente ✅
**Creado:** `packages/dashboard/src/features/setup/components/agent-selector.tsx`
- Modal/Dialog que muestra:
  - Grid de agentes detectados (Claude Code, Codex, Copilot, Gemini)
  - Badge verde "Detectado" si está instalado y autenticado
  - Badge gris "No instalado" con link a instrucciones
  - Select secundario para elegir modelo según el agente seleccionado
- Se muestra en:
  - Setup screen (primer uso)
  - Settings (cambiar agente default)
  - Create task (override opcional)

### 4C. Integrar en Setup Screen ✅
**Modificado:** `packages/dashboard/src/features/setup/components/setup-screen.tsx`
- Reemplazar la sección de "AI Provider" (cards de Claude/OpenAI/OpenRouter) con el nuevo `AgentSelector`
- Step 1: "Selecciona tu agente de coding"
- Mantener Step 2: GitHub

### 4D. Actualizar setup store ✅
**Modificado:** `packages/dashboard/src/features/setup/stores/setup-store.ts`
- Reemplazar `aiProvider`, `aiConnected`, `aiModel`, `aiModelInfo` con:
  - `selectedAgent: string | null` (agent type id)
  - `selectedAgentModel: string | null`
  - `detectedAgents: DetectedAgent[]`
- Nuevas actions: `setSelectedAgent`, `setDetectedAgents`

### 4E. Actualizar Settings connections ✅
**Modificado:** `packages/dashboard/src/features/settings/components/connections-section.tsx`
- Reemplazar la sección de AI connection con:
  - Icono del agente seleccionado
  - Nombre + modelo actual
  - Botón "Cambiar agente" → abre AgentSelector
  - Badge de estado (Conectado/Desconectado)

---

## Fase 5: Frontend — Panel de ejecución (drawer lateral) ✅ COMPLETADA

### 5A. Actualizar el panel de logs existente ✅
**Creado:** `packages/dashboard/src/features/tasks/utils/agent-display.ts`
**Modificado:** `packages/dashboard/src/features/tasks/components/task-header.tsx`
**Modificado:** `packages/dashboard/src/features/tasks/components/task-detail.tsx`
**Modificado:** `packages/dashboard/src/features/tasks/components/task-logs.tsx`
**Modificado:** `packages/dashboard/src/features/tasks/components/connection-status.tsx`
- Shared utility `agent-display.ts` con `AGENT_DISPLAY_INFO`, `getAgentDisplayInfo()`, `getAgentLabel()`
- Badge de agente en task header (icon + nombre + modelo)
- Nombre del agente en la pestaña de logs ("Execution Logs" + badge de agente)
- Connection status muestra nombre del agente (e.g., "Claude Code — Connected")
- Empty state personalizado ("Waiting for Claude Code output...")

### 5B. Agregar selector de agente en creación de tarea ✅
**Modificado:** `packages/dashboard/src/features/tasks/components/create-task-dialog.tsx`
- Sección colapsable "Agent override" con Collapsible component
- Selector de agente (solo agentes instalados) con opción "Use default"
- Selector de modelo (aparece cuando el agente tiene múltiples modelos)
- `agent_type` y `agent_model` se pasan al crear la tarea
- Estado se resetea al cerrar el diálogo

---

## Fase 6: PM Agent con CLI (spec generation) ✅ COMPLETADA

### 6A. Adaptar PM Agent para usar CLI ✅
**Modificado:** `packages/server/src/services/pm-agent.service.ts`
**Modificado:** `packages/server/src/routes/tasks.ts`
- `getAvailableCLIAgent()` — Verifica si hay CLI configurado e instalado (via settingsService + detectAgent)
- `buildSpecCommand()` — Construye comando CLI optimizado para generación single-turn (--max-turns 1)
- `parseCLIOutput()` — Parsea output de cada CLI (JSON, JSONL, NDJSON, texto plano)
- `callCLIForSpec()` — Ejecuta CLI con execFile (timeout 120s, 10MB buffer)
- `generateSpec()` y `regenerateSpec()` — `aiConfig` ahora es opcional
- Lógica de fallback: CLI primero → API si CLI falla → error si nada disponible
- Route actualizada: `aiConfig` ya no es obligatorio, permite generar specs sin API keys

---

## Orden de Ejecución

```
Fase 1: Detección (base para todo)
  1C (schemas) → 1A (servicio) → 1B (endpoint)

Fase 2: CLI Runner (core)
  2A (interface) → 2C (prompts) → 2B (cli-runner) → 2D (factory) → 2E (agent service)

Fase 3: Configuración (storage)
  3A (tabla) → 3B (service) → 3C (endpoints) → 3D (task columns)

Fase 4: Frontend selección (UI)
  4A (hook) → 4D (store) → 4B (selector) → 4C (setup) → 4E (settings)

Fase 5: Frontend ejecución (UI)
  5A (panel) → 5B (create task)

Fase 6: PM Agent (mejora)
  6A (adaptar pm-agent)
```

---

## Archivos Críticos

| Archivo | Acción | Fase | Estado |
|---------|--------|------|--------|
| `packages/shared/src/schemas/agent.schema.ts` | CREAR | 1C | ✅ |
| `packages/server/src/services/agent-detection.service.ts` | CREAR | 1A | ✅ |
| `packages/server/src/routes/setup.ts` | MODIFICAR | 1B, 3C | ✅ |
| `packages/server/src/agent/types.ts` | CREAR | 2A | ✅ |
| `packages/server/src/agent/cli-runner.ts` | CREAR | 2B | ✅ |
| `packages/server/src/agent/cli-prompts.ts` | CREAR | 2C | ✅ |
| `packages/server/src/agent/index.ts` | MODIFICAR | 2D | ✅ |
| `packages/server/src/services/agent.service.ts` | MODIFICAR | 2E | ✅ |
| `packages/server/src/services/settings.service.ts` | CREAR | 3B | ✅ |
| `packages/server/src/db/migrations.ts` | MODIFICAR | 3A, 3D | ✅ |
| `packages/shared/src/schemas/task.schema.ts` | MODIFICAR | 3D | ✅ |
| `packages/dashboard/src/features/setup/components/agent-selector.tsx` | CREAR | 4B | ✅ |
| `packages/dashboard/src/features/setup/components/setup-screen.tsx` | MODIFICAR | 4C | ✅ |
| `packages/dashboard/src/features/setup/stores/setup-store.ts` | MODIFICAR | 4D | ✅ |
| `packages/dashboard/src/features/setup/hooks/use-detected-agents.ts` | CREAR | 4A | ✅ |
| `packages/dashboard/src/features/settings/components/connections-section.tsx` | MODIFICAR | 4E | ✅ |
| `packages/dashboard/src/features/tasks/utils/agent-display.ts` | CREAR | 5A | ✅ |
| `packages/dashboard/src/features/tasks/components/task-header.tsx` | MODIFICAR | 5A | ✅ |
| `packages/dashboard/src/features/tasks/components/task-detail.tsx` | MODIFICAR | 5A | ✅ |
| `packages/dashboard/src/features/tasks/components/task-logs.tsx` | MODIFICAR | 5A | ✅ |
| `packages/dashboard/src/features/tasks/components/connection-status.tsx` | MODIFICAR | 5A | ✅ |
| `packages/dashboard/src/features/tasks/components/create-task-dialog.tsx` | MODIFICAR | 5B | ✅ |
| `packages/server/src/services/pm-agent.service.ts` | MODIFICAR | 6A | ✅ |
| `packages/server/src/routes/tasks.ts` | MODIFICAR | 6A | ✅ |

---

## Referencia: Comandos CLI por agente

| Agente | Headless | Streaming | Auto-approve | Modelo |
|--------|----------|-----------|--------------|--------|
| Claude Code | `claude -p "<prompt>"` | `--output-format stream-json --verbose` | `--allowedTools "Read,Edit,Bash,Write"` | `--model opus` |
| Codex | `codex exec "<prompt>"` | `--json` | `--full-auto` o `--yolo` | `-m gpt-4o` |
| Copilot | `copilot -p "<prompt>"` | stdout | `--allow-all-tools` | (default) |
| Gemini | `gemini --non-interactive "<prompt>"` | `--output-format ndjson` | `--yolo` | `--model gemini-2.5-pro` |

---

## Verificación

1. **Detección**: `GET /setup/agents` → muestra CLIs instalados con estado correcto
2. **Claude Code**: Seleccionar Claude Code → crear tarea → ejecutar → ver output en panel lateral
3. **Codex**: Cambiar agente a Codex → ejecutar tarea → ver output
4. **Cambio de agente**: Desde Settings → cambiar agente default → nueva tarea usa el nuevo agente
5. **CLI no instalado**: Seleccionar agente no instalado → mostrar error claro con instrucciones
6. **Cancelación**: Cancelar tarea → proceso CLI se mata correctamente
7. **Backward compat**: Si ningún CLI está instalado → fallback al runner legacy con API key

## Riesgos

1. **Medio**: Parseo de output de cada CLI. Cada uno tiene formato diferente. Necesita testing con cada CLI.
2. **Bajo**: Detección de CLIs en Windows (el proyecto corre en Windows). Usar `where` en vez de `which`.
3. **Bajo**: Manejo de procesos hijo en Windows. Usar `taskkill` para cleanup.
4. **Bajo**: Timeout/cleanup de procesos zombi. Ya tenemos `process-killer.ts` que podemos reusar.
