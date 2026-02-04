# Plan de Implementacion: dash-agent

## Vision del Producto

**Dashboard web para gestionar tareas ejecutadas por agentes IA con tu suscripcion de Claude o ChatGPT.**

Sin login tradicional. Sin cuentas. Conectas tu suscripcion de Claude/ChatGPT y empezas a usar.

### Propuesta de Valor Unica

**El valor no es "ejecuta tareas" sino "ayuda a especificar tareas que se ejecuten bien".**

Usamos dos agentes especializados:
1. **PM Agent** - Escribe especificaciones detalladas a partir de ideas vagas
2. **Dev Agent** - Ejecuta las especificaciones aprobadas

El usuario siempre tiene control: puede leer y editar la spec antes de ejecutar.

### Diferenciacion vs Vibe Kanban

| Vibe Kanban | dash-agent (nosotros) |
|-------------|----------------------|
| CLI + binarios | Web app (zero install) |
| Un solo agente | **Dos agentes: PM + Dev** |
| Usuario escribe todo | **Agente genera spec, usuario edita** |
| Sin learning | **Aprende de feedback** |
| Vista lista | **Board view estilo Kanban** |

---

## Arquitectura Simple

### Sin Auth Tradicional

No hay login con Google/GitHub para crear cuenta. El "auth" es:

1. **Conectar Claude o ChatGPT** - Para usar los agentes con tu suscripcion
2. **Conectar GitHub** - Para crear PRs en tus repos

### Modelo de Datos

```
User Settings (localStorage o SQLite)
  |
  +-- AI Provider Connection
  |     +-- Claude (API key o OAuth)
  |     +-- ChatGPT (API key o OAuth)
  |
  +-- GitHub Connection
  |     +-- OAuth token
  |
  +-- Repositories
  |     +-- Repository Context (convenciones, patterns)
  |
  +-- Tasks
        +-- user_input (idea original)
        +-- generated_spec (borrador del PM Agent)
        +-- final_spec (editada/aprobada por usuario)
```

### Stack Tecnologico

| Componente | Tecnologia | Justificacion |
|------------|------------|---------------|
| Frontend | Next.js 16 + React 19 | Ya lo tenemos |
| Backend | Express (actual) | Simple, funciona |
| Database | SQLite (sql.js) | Ya lo tenemos, suficiente |
| Storage | localStorage + SQLite | Configs en localStorage, data en SQLite |
| AI | Claude API / OpenAI API | Segun lo que conecte el usuario |
| GitHub | Octokit | Ya lo tenemos |

---

## Arquitectura de Dos Agentes (Core Feature)

### Los Dos Roles

| Rol | Nombre | Responsabilidad | Modelo |
|-----|--------|-----------------|--------|
| **PM Agent** | Specifier | Analiza repo, escribe specs detalladas | Usa la conexion del usuario |
| **Dev Agent** | Coder | Toma la spec y escribe codigo | Usa la conexion del usuario |

### Flujo de Trabajo

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  draft   │ -> │ refining │ -> │ pending  │ -> │  coding  │ -> │  review  │ -> done
│          │    │          │    │ approval │    │          │    │          │
│ Usuario  │    │ PM Agent │    │ Usuario  │    │Dev Agent │    │ Usuario  │
│ escribe  │    │ genera   │    │ lee/edita│    │ ejecuta  │    │ revisa   │
│ idea     │    │ spec     │    │ aprueba  │    │ spec     │    │ PR       │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Flujo Visual Detallado

```
Usuario          PM Agent              Usuario              Dev Agent
   │                 │                    │                     │
   │  "filtro fecha" │                    │                     │
   │────────────────>│                    │                     │
   │                 │                    │                     │
   │                 │  analiza repo      │                     │
   │                 │  genera spec       │                     │
   │                 │  (borrador)        │                     │
   │                 │                    │                     │
   │<────────────────│                    │                     │
   │   spec borrador │                    │                     │
   │                 │                    │                     │
   │   LEE la spec   │                    │                     │
   │   EDITA si necesita                  │                     │
   │   APRUEBA       │                    │                     │
   │                 │                    │                     │
   │   click "Ejecutar"                   │                     │
   │─────────────────────────────────────>│                     │
   │                      spec final      │                     │
   │                      (editada)       │                     │
   │                                      │────────────────────>│
   │                                      │   ejecuta spec      │
   │                                      │   crea branch       │
   │                                      │   escribe codigo    │
   │                                      │   crea PR           │
   │                                      │                     │
   │                                      │<────────────────────│
   │                                      │        PR listo     │
   │<─────────────────────────────────────│                     │
   │              PR para review          │                     │
```

---

## Fase 0: Setup Screen

### Pantalla Inicial

Cuando el usuario abre la app por primera vez:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                              dash-agent                                     │
│                                                                             │
│                    Gestiona tareas con agentes IA                           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Paso 1: Conecta tu proveedor de IA                                   │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐             │  │
│  │  │                         │  │                         │             │  │
│  │  │   🤖 Claude             │  │   🤖 ChatGPT            │             │  │
│  │  │                         │  │                         │             │  │
│  │  │   Usa tu suscripcion    │  │   Usa tu suscripcion    │             │  │
│  │  │   de Claude Pro o API   │  │   de ChatGPT Plus o API │             │  │
│  │  │                         │  │                         │             │  │
│  │  │   [Conectar]            │  │   [Conectar]            │             │  │
│  │  │                         │  │                         │             │  │
│  │  └─────────────────────────┘  └─────────────────────────┘             │  │
│  │                                                                       │  │
│  │  ─────────────────────────────────────────────────────────────────    │  │
│  │                                                                       │  │
│  │  Paso 2: Conecta GitHub (para crear PRs)                              │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  🐙 GitHub                                         [Conectar]   │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Opciones de Conexion AI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Conectar Claude                                                      [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ¿Como queres conectar?                                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  🔑 API Key                                                         │    │
│  │                                                                     │    │
│  │  Pega tu API key de Anthropic                                       │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx                    │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │  Obtener key: console.anthropic.com                                 │    │
│  │                                                                     │    │
│  │                                                    [Validar Key]    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  🔗 OAuth (Claude Pro) - Coming Soon                                │    │
│  │                                                                     │    │
│  │  Conecta con tu cuenta de Claude Pro para usar tu suscripcion       │    │
│  │  sin necesidad de API key.                                          │    │
│  │                                                                     │    │
│  │                                                    [Proximamente]   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Archivos a crear

```
packages/dashboard/src/
  features/setup/
    components/
      setup-screen.tsx        # Pantalla principal
      ai-provider-card.tsx    # Card para Claude/ChatGPT
      api-key-dialog.tsx      # Modal para ingresar API key
      github-connect.tsx      # Boton para conectar GitHub
      setup-complete.tsx      # Pantalla de exito
    hooks/
      use-setup-status.ts     # Verificar si esta configurado
      use-validate-key.ts     # Validar API key
      use-github-oauth.ts     # OAuth con GitHub
    stores/
      setup-store.ts          # Estado de configuracion
    types/
      index.ts

packages/server/src/
  routes/
    setup.ts                  # Endpoints de setup
  services/
    ai-provider.service.ts    # Validar keys, detectar modelo
    github-oauth.service.ts   # OAuth flow
```

### Endpoints

| Method | Path | Descripcion |
|--------|------|-------------|
| POST | `/setup/validate-ai-key` | Validar API key de Claude/OpenAI |
| GET | `/setup/github/auth` | Iniciar OAuth con GitHub |
| GET | `/setup/github/callback` | Callback de OAuth |
| GET | `/setup/status` | Estado actual de configuracion |
| DELETE | `/setup/ai-provider` | Desconectar proveedor AI |
| DELETE | `/setup/github` | Desconectar GitHub |

### Storage

```typescript
// localStorage keys
const STORAGE_KEYS = {
  AI_PROVIDER: 'dash-agent:ai-provider',      // 'claude' | 'openai'
  AI_API_KEY: 'dash-agent:ai-api-key',        // Encriptada
  GITHUB_TOKEN: 'dash-agent:github-token',    // OAuth token
  SETUP_COMPLETE: 'dash-agent:setup-complete' // boolean
}

// Estructura
interface SetupConfig {
  aiProvider: 'claude' | 'openai' | null
  aiApiKey: string | null           // Solo se guarda si el usuario quiere
  githubConnected: boolean
  githubUsername: string | null
}
```

---

## Fase 1: Gestion de Repositorios

### Agregar Repos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tus Repositorios                                           [+ Agregar Repo] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  📁 ezeoli88/dash-agent                                             │    │
│  │  main • Next.js, Zustand, Tailwind                                  │    │
│  │  3 tareas activas                                      [Configurar] │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  📁 ezeoli88/otro-proyecto                                          │    │
│  │  main • React, Redux, CSS Modules                                   │    │
│  │  0 tareas activas                                      [Configurar] │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│  │  + Agregar repositorio                                              │    │
│  │    Selecciona de tus repos de GitHub o pega una URL                 │    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Dialog para Agregar Repo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Agregar Repositorio                                                  [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Tus repos de GitHub                                        [🔍 Buscar]    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ○ ezeoli88/nuevo-proyecto                                          │    │
│  │  ○ ezeoli88/api-service                                             │    │
│  │  ○ ezeoli88/mobile-app                                              │    │
│  │  ● ezeoli88/otro-proyecto                              ← selected   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ─────────────────── o pega una URL ───────────────────                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ https://github.com/usuario/repo.git                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                                        [Cancelar]    [Agregar Repo]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Repository Context

Cada repo tiene contexto que el PM Agent usa para generar mejores specs:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ezeoli88/dash-agent > Configuracion                                  [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stack Detectado                        Convenciones                        │
│  ┌────────────────────────────────┐     ┌────────────────────────────────┐  │
│  │ Framework: Next.js 16          │     │ ## Estado                      │  │
│  │ State: Zustand                 │     │ - Usamos Zustand, NO Redux     │  │
│  │ Styling: Tailwind CSS          │     │ - Stores en /stores            │  │
│  │ Testing: Vitest                │     │                                │  │
│  │                                │     │ ## Componentes                 │  │
│  │ [Re-detectar]                  │     │ - Logica en hooks, no en       │  │
│  └────────────────────────────────┘     │   componentes                  │  │
│                                         │ - UI con shadcn/ui             │  │
│  Patterns Aprendidos                    │                                │  │
│  ┌────────────────────────────────┐     │ ## API                         │  │
│  │ • "Usar Tailwind, no CSS       │     │ - REST con Zod validation      │  │
│  │    global" (task #12)          │     │ - Endpoints en /api/           │  │
│  │                                │     │                                │  │
│  │ • "Stores van en /stores"      │     │                     [Guardar]  │  │
│  │    (task #8)                   │     └────────────────────────────────┘  │
│  │                                │                                         │
│  │ [Limpiar patterns]             │                                         │
│  └────────────────────────────────┘                                         │
│                                                                             │
│  Branch por defecto: main                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ main                                                            [v] │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│                              [Eliminar Repo]    [Guardar Cambios]           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Schema

```typescript
// repositories table
interface Repository {
  id: string
  name: string              // "ezeoli88/dash-agent"
  url: string               // "https://github.com/ezeoli88/dash-agent"
  default_branch: string    // "main"

  // Contexto para el PM Agent
  detected_stack: {
    framework: string | null
    state_management: string | null
    styling: string | null
    testing: string | null
  }
  conventions: string       // Markdown con convenciones (editable)
  learned_patterns: {
    pattern: string
    learned_from_task_id: string
    created_at: string
  }[]

  created_at: string
  updated_at: string
}
```

### Archivos a crear

```
packages/dashboard/src/
  features/repos/
    components/
      repo-list.tsx
      repo-card.tsx
      add-repo-dialog.tsx
      repo-config-dialog.tsx
      conventions-editor.tsx
      learned-patterns-list.tsx
    hooks/
      use-repos.ts
      use-repo-context.ts
      use-github-repos.ts      # Listar repos del usuario
    stores/
      repo-store.ts            # Repo seleccionado
    types/
      index.ts

packages/server/src/
  routes/
    repos.ts
  services/
    repo.service.ts
    stack-detector.service.ts  # Detectar framework, etc.
```

### Endpoints

| Method | Path | Descripcion |
|--------|------|-------------|
| GET | `/repos` | Listar repos del usuario |
| POST | `/repos` | Agregar repo |
| GET | `/repos/:id` | Detalle de repo |
| PATCH | `/repos/:id` | Actualizar repo (convenciones, branch) |
| DELETE | `/repos/:id` | Eliminar repo |
| POST | `/repos/:id/detect-stack` | Re-detectar stack |
| GET | `/github/repos` | Listar repos de GitHub del usuario |

---

## Fase 2: Sistema de Dos Agentes

### UI: Crear Tarea (Paso 1 - Input)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Nueva Tarea                                                          [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Repositorio                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ezeoli88/dash-agent                                             [v] │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ¿Que necesitas?                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Agregar filtro por fecha en la lista de transacciones               │    │
│  │                                                                     │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Tip: Describe lo que quieres lograr. El PM Agent escribira una             │
│       especificacion detallada que podras revisar y editar.                 │
│                                                                             │
│                                         [Cancelar]  [Generar Spec ->]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI: Revisar y Editar Spec (Paso 2 - Review)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Revisar Especificacion                                               [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  El PM Agent genero esta especificacion. Editala si es necesario:           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                        [Editable]   │    │
│  │ ## Historia de Usuario                                              │    │
│  │ Como usuario, quiero filtrar transacciones por fecha para           │    │
│  │ encontrar movimientos de un periodo especifico.                     │    │
│  │                                                                     │    │
│  │ ## Contexto Tecnico                                                 │    │
│  │ - Stack: Next.js 16, Zustand, shadcn/ui                             │    │
│  │ - API existente soporta params `from` y `to`                        │    │
│  │ - Componente DateRangePicker disponible en ui/                      │    │
│  │                                                                     │    │
│  │ ## Plan de Implementacion                                           │    │
│  │ 1. Agregar `dateFilter` al transaction-store.ts                     │    │
│  │ 2. Crear componente TransactionDateFilter.tsx                       │    │
│  │ 3. Integrar en TransactionList                                      │    │
│  │ 4. Sincronizar filtro con URL params                                │    │
│  │                                                                     │    │
│  │ ## Archivos a Modificar                                             │    │
│  │ - src/stores/transaction-store.ts                                   │    │
│  │ - src/features/transactions/components/transaction-list.tsx         │    │
│  │ - src/features/transactions/hooks/use-transactions.ts               │    │
│  │                                                                     │    │
│  │ ## Criterios de Aceptacion                                          │    │
│  │ - [ ] Selector de rango de fechas visible sobre la tabla            │    │
│  │ - [ ] Lista se actualiza al cambiar fechas                          │    │
│  │ - [ ] URL refleja el filtro (ej: ?from=2024-01-01&to=...)           │    │
│  │ - [ ] Boton "Limpiar" restaura la vista completa                    │    │
│  │ - [ ] Funciona en mobile                                            │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Mientras mas detallada la spec, mejor sera el codigo generado              │
│                                                                             │
│              [<- Volver]    [Regenerar]    [Ejecutar Tarea ->]              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI: Ejecutando (Paso 3 - Coding)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Task #42: Agregar filtro por fecha                              In Progress │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Spec Aprobada                         Dev Agent Log                        │
│  ┌────────────────────────────────┐    ┌────────────────────────────────┐   │
│  │ ## Historia de Usuario         │    │ [14:32:01] Creando branch...   │   │
│  │ Como usuario, quiero filtrar...│    │ [14:32:02] feature/task-42     │   │
│  │                                │    │ [14:32:05] Analizando spec...  │   │
│  │ ## Contexto Tecnico            │    │ [14:32:08] Modificando:        │   │
│  │ - Stack: Next.js 16...         │    │   transaction-store.ts         │   │
│  │                                │    │ [14:32:15] Creando:            │   │
│  │ ## Plan de Implementacion      │    │   TransactionDateFilter.tsx    │   │
│  │ 1. Agregar dateFilter...       │    │ [14:32:22] Modificando:        │   │
│  │ 2. Crear componente...         │    │   transaction-list.tsx         │   │
│  │ ...                            │    │ [14:32:30] Ejecutando tests... │   │
│  │                                │    │ [14:32:45] Tests: 12/12 ✓      │   │
│  │ ## Criterios de Aceptacion     │    │ [14:32:50] Creando PR...       │   │
│  │ - [x] Selector de rango...     │    │ [14:32:55] PR #142 creado      │   │
│  │ - [x] Lista se actualiza...    │    │                                │   │
│  │ - [x] URL refleja filtro...    │    │ ✓ Tarea completada             │   │
│  └────────────────────────────────┘    └────────────────────────────────┘   │
│                                                                             │
│                                               [Ver PR]  [Ver Diff]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### PM Agent Service

```typescript
// packages/server/src/services/pm-agent.service.ts

interface GenerateSpecInput {
  user_input: string
  repository_id: string
}

interface GenerateSpecOutput {
  spec: string
  model_used: string
  tokens_used: number
}

async function generateSpec(input: GenerateSpecInput): Promise<GenerateSpecOutput> {
  // 1. Obtener contexto del repo
  const repo = await getRepository(input.repository_id)

  // 2. Construir prompt
  const prompt = buildPMAgentPrompt({
    user_input: input.user_input,
    detected_stack: repo.detected_stack,
    conventions: repo.conventions,
    learned_patterns: repo.learned_patterns,
  })

  // 3. Llamar al LLM (usa el provider configurado por el usuario)
  const aiProvider = await getConfiguredAIProvider()
  const response = await aiProvider.complete({
    messages: [
      { role: 'system', content: PM_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  })

  return {
    spec: response.content,
    model_used: aiProvider.model,
    tokens_used: response.usage.total_tokens
  }
}

const PM_AGENT_SYSTEM_PROMPT = `
Eres un Product Manager tecnico experto. Tu trabajo es tomar ideas vagas
de usuarios y convertirlas en especificaciones detalladas que un agente
de codigo pueda implementar.

Siempre generas specs en este formato:

## Historia de Usuario
[Quien, que, para que]

## Contexto Tecnico
[Stack detectado, archivos relevantes, patrones existentes]

## Plan de Implementacion
[Pasos numerados, especificos]

## Archivos a Modificar
[Lista de paths]

## Criterios de Aceptacion
[Checkbox list verificable]

Sigue las convenciones del proyecto. No inventes tecnologias que el
proyecto no usa. Se especifico y actionable.
`
```

### Dev Agent Service

```typescript
// packages/server/src/services/dev-agent.service.ts

interface ExecuteSpecInput {
  task_id: string
  final_spec: string
  repository_id: string
}

interface ExecuteSpecOutput {
  branch_name: string
  pr_url: string
  pr_number: number
  files_changed: string[]
}

async function executeSpec(input: ExecuteSpecInput): Promise<ExecuteSpecOutput> {
  const repo = await getRepository(input.repository_id)
  const aiProvider = await getConfiguredAIProvider()

  // 1. Crear branch
  const branchName = `feature/task-${input.task_id}`
  await github.createBranch(repo, branchName)

  // 2. Ejecutar con el agente (Claude Code style)
  const result = await aiProvider.executeTask({
    spec: input.final_spec,
    repo: repo,
    branch: branchName
  })

  // 3. Crear PR
  const pr = await github.createPullRequest({
    repo: repo.name,
    title: extractTitle(input.final_spec),
    body: formatPRBody(input.final_spec),
    head: branchName,
    base: repo.default_branch
  })

  return {
    branch_name: branchName,
    pr_url: pr.html_url,
    pr_number: pr.number,
    files_changed: result.files_changed
  }
}
```

### Task Schema

```typescript
// tasks table
interface Task {
  id: string
  repository_id: string

  // Input del usuario (Paso 1)
  user_input: string            // "Agregar filtro por fecha"

  // Output del PM Agent (Paso 2)
  generated_spec: string | null // Spec generada (markdown)
  generated_spec_at: string | null

  // Spec final aprobada (Paso 3)
  final_spec: string | null     // Puede ser editada por usuario
  spec_approved_at: string | null
  was_spec_edited: boolean      // true si usuario modifico

  // Output del Dev Agent (Paso 4)
  branch_name: string | null
  pr_url: string | null
  pr_number: number | null

  // Estado
  status: TaskStatus

  created_at: string
  updated_at: string
}

type TaskStatus =
  | 'draft'              // Usuario escribiendo idea
  | 'refining'           // PM Agent generando spec
  | 'pending_approval'   // Esperando que usuario apruebe/edite spec
  | 'approved'           // Spec aprobada, en cola para Dev Agent
  | 'coding'             // Dev Agent trabajando
  | 'review'             // PR creado, esperando review
  | 'changes_requested'  // Usuario pidio cambios al PR
  | 'done'               // PR mergeado
  | 'failed'             // Error
```

### Endpoints de Tasks

| Method | Path | Descripcion |
|--------|------|-------------|
| GET | `/tasks` | Listar tareas |
| POST | `/tasks` | Crear tarea (draft) |
| GET | `/tasks/:id` | Detalle de tarea |
| POST | `/tasks/:id/generate-spec` | PM Agent genera spec |
| POST | `/tasks/:id/regenerate-spec` | Regenerar spec |
| PATCH | `/tasks/:id/spec` | Usuario edita spec |
| POST | `/tasks/:id/approve` | Aprobar spec y ejecutar |
| POST | `/tasks/:id/cancel` | Cancelar tarea |
| GET | `/tasks/:id/logs` | SSE de logs del agente |

### Archivos a crear

```
packages/dashboard/src/
  features/tasks/
    components/
      create-task-dialog.tsx      # Paso 1: input
      spec-editor.tsx             # Paso 2: revisar/editar
      task-execution-view.tsx     # Paso 3: ver progreso
      task-detail.tsx             # Vista completa
    hooks/
      use-create-task.ts
      use-generate-spec.ts
      use-approve-spec.ts
      use-task-logs.ts            # SSE

packages/server/src/
  services/
    pm-agent.service.ts
    dev-agent.service.ts
    ai-provider.service.ts        # Abstraccion Claude/OpenAI
  routes/
    tasks.ts
```

---

## Fase 3: Board View

### Columnas

| Columna | Statuses | Color | Descripcion |
|---------|----------|-------|-------------|
| Ideas | `draft`, `refining` | gray | Usuario escribiendo o PM Agent trabajando |
| Ready | `pending_approval` | yellow | Spec lista para revisar |
| In Progress | `approved`, `coding` | blue | Dev Agent trabajando |
| Review | `review`, `changes_requested` | purple | PR listo para review |
| Done | `done` | green | PR mergeado |

### Diseno

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ dash-agent                              [Settings]  [+ Nueva Tarea]         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Repos                    Board: ezeoli88/dash-agent                        │
│  ┌────────────────────┐                                                     │
│  │ > dash-agent       │   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │   otro-proyecto    │   │ Ideas  │ │ Ready  │ │In Prog │ │ Review │ Done │
│  │                    │   │  (2)   │ │  (1)   │ │  (1)   │ │  (1)   │ (5)  │
│  │ [+ Agregar repo]   │   ├────────┤ ├────────┤ ├────────┤ ├────────┤──────│
│  └────────────────────┘   │┌──────┐│ │┌──────┐│ │┌──────┐│ │┌──────┐│┌────┐│
│                           ││Task 1││ ││Task 3││ ││Task 5││ ││Task 6││|T 7 ││
│                           ││      ││ ││[edit]││ ││[code]││ ││[PR]  │││    ││
│                           │└──────┘│ │└──────┘│ │└──────┘│ │└──────┘│└────┘│
│                           │┌──────┐│ │        │ │        │ │        │┌────┐│
│                           ││Task 2││ │        │ │        │ │        ││T 8 ││
│                           ││[spec]││ │        │ │        │ │        ││    ││
│                           │└──────┘│ │        │ │        │ │        │└────┘│
│                           └────────┘ └────────┘ └────────┘ └────────┘──────│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Board Card

```
┌────────────────────────────────────┐
│ #42 Agregar filtro por fecha       │
│                                    │
│ [refining] PM Agent trabajando...  │
│                                    │
│ hace 2 min                         │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ #43 Fix bug en login               │
│                                    │
│ [pending_approval]                 │
│ Spec lista - Click para revisar    │
│                                    │
│ hace 5 min                         │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ #44 Agregar dark mode              │
│                                    │
│ [review] PR #156                   │
│ 3 files changed                    │
│                                    │
│ hace 1 hora                        │
└────────────────────────────────────┘
```

### Archivos a crear

```
packages/dashboard/src/
  features/board/
    components/
      board-view.tsx
      board-column.tsx
      board-card.tsx
      board-header.tsx
    hooks/
      use-board-tasks.ts        # Agrupa por columna
    types/
      index.ts

packages/dashboard/src/app/
  page.tsx                      # Board view (pagina principal)
  settings/
    page.tsx                    # Settings (conexiones, etc)
```

---

## Fase 4: Learning from Feedback

### Cuando se rechaza un PR o se piden cambios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Task #15 - Changes Requested                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Tu comentario en el PR:                                                    │
│  "No uses clases CSS globales, en este proyecto usamos Tailwind"            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Guardar como patron para futuras tareas?                              │  │
│  │                                                                       │  │
│  │ El agente recordara:                                                  │  │
│  │ "Usar clases de Tailwind en lugar de CSS global"                      │  │
│  │                                                                       │  │
│  │ Esto aplicara a futuras tareas en este repositorio.                   │  │
│  │                                                                       │  │
│  │                         [Ignorar]    [Guardar Pattern]                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Patterns en Repository Context

Los patterns aprendidos se muestran en la config del repo y se usan automaticamente en futuras specs.

---

## Fase 5: Polish

### Settings Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Conexiones                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🤖 Claude                                          [✓ Conectado]     │  │
│  │     Modelo: claude-sonnet-4-20250514                                  │  │
│  │                                            [Cambiar]  [Desconectar]   │  │
│  │                                                                       │  │
│  │  🐙 GitHub                                          [✓ Conectado]     │  │
│  │     Usuario: ezeoli88                                                 │  │
│  │                                                       [Desconectar]   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Preferencias                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Tema                                                                 │  │
│  │  ○ Claro   ● Oscuro   ○ Sistema                                       │  │
│  │                                                                       │  │
│  │  Idioma de specs                                                      │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Espanol                                                     [v] │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Datos                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  [Exportar datos]    [Importar datos]    [Borrar todo]                │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Orden de Implementacion

### Sprint 1: Setup Screen (1 semana)
1. Setup store y localStorage
2. UI de setup screen
3. Validacion de API keys
4. OAuth con GitHub
5. Redirect a board cuando esta configurado

### Sprint 2: Repositorios (1 semana)
1. CRUD de repos
2. Listar repos de GitHub
3. Deteccion de stack
4. Editor de convenciones
5. UI de lista de repos en sidebar

### Sprint 3: Sistema de Dos Agentes (2 semanas)
1. PM Agent service
2. Endpoint generate-spec
3. UI de crear tarea (paso 1)
4. UI de revisar/editar spec (paso 2)
5. Dev Agent service
6. UI de ejecucion (paso 3)
7. Integracion con GitHub (crear PR)
8. SSE para logs en tiempo real

### Sprint 4: Board View (1 semana)
1. Board view con columnas
2. Board cards
3. Click en card -> ver detalle
4. Filtrar por repo
5. Actualizar en tiempo real (polling o SSE)

### Sprint 5: Learning + Polish (1 semana)
1. Sistema de patterns aprendidos
2. Settings page
3. Dark mode
4. Export/import data
5. Bug fixes

---

## Estructura de Archivos Final

```
packages/dashboard/src/
  app/
    page.tsx                    # Board view (requiere setup)
    settings/
      page.tsx                  # Settings
    layout.tsx

  features/
    setup/
      components/
        setup-screen.tsx
        ai-provider-card.tsx
        api-key-dialog.tsx
        github-connect.tsx
      hooks/
        use-setup-status.ts
        use-validate-key.ts
      stores/
        setup-store.ts

    repos/
      components/
        repo-list.tsx
        repo-card.tsx
        add-repo-dialog.tsx
        repo-config-dialog.tsx
        conventions-editor.tsx
      hooks/
        use-repos.ts
        use-github-repos.ts
      stores/
        repo-store.ts

    tasks/
      components/
        create-task-dialog.tsx
        spec-editor.tsx
        task-execution-view.tsx
        task-detail.tsx
      hooks/
        use-create-task.ts
        use-generate-spec.ts
        use-approve-spec.ts
        use-task-logs.ts

    board/
      components/
        board-view.tsx
        board-column.tsx
        board-card.tsx
      hooks/
        use-board-tasks.ts

packages/server/src/
  routes/
    setup.ts
    repos.ts
    tasks.ts
  services/
    ai-provider.service.ts
    pm-agent.service.ts
    dev-agent.service.ts
    repo.service.ts
    stack-detector.service.ts
    github-oauth.service.ts
```

---

## Storage

### localStorage

```typescript
// Configuracion del usuario
'dash-agent:ai-provider'     // 'claude' | 'openai'
'dash-agent:ai-api-key'      // API key (opcional, puede pedir cada vez)
'dash-agent:github-token'    // OAuth token
'dash-agent:setup-complete'  // boolean
'dash-agent:theme'           // 'light' | 'dark' | 'system'
'dash-agent:spec-language'   // 'es' | 'en'
```

### SQLite (sql.js)

```sql
-- Repos del usuario
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  detected_stack TEXT,           -- JSON
  conventions TEXT,              -- Markdown
  learned_patterns TEXT,         -- JSON array
  created_at TEXT,
  updated_at TEXT
);

-- Tareas
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  user_input TEXT NOT NULL,
  generated_spec TEXT,
  generated_spec_at TEXT,
  final_spec TEXT,
  spec_approved_at TEXT,
  was_spec_edited INTEGER DEFAULT 0,
  branch_name TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (repository_id) REFERENCES repositories(id)
);
```

---

## Checklist de Lanzamiento

### MVP
- [x] Setup screen funcional
- [x] Conectar Claude/OpenAI via API key
- [x] Conectar GitHub via OAuth
- [x] Agregar repos
- [x] PM Agent genera specs
- [x] Usuario puede editar specs
- [x] Dev Agent ejecuta specs
- [x] Board view basico
- [x] Ver detalle de task

### v1.0
- [x] Dev Agent crea PRs reales
- [x] Diff viewer
- [x] Learning from feedback
- [x] Dark mode
- [x] Export/import data
- [x] Settings page completa

### v1.1+
- [x] OpenRouter con modelos gratuitos
- [x] Server-side storage seguro (AES-256-GCM)
- [x] GitHub: OAuth + Personal Access Token
- [ ] OAuth con Claude Pro (cuando este disponible)
- [ ] OAuth con ChatGPT Plus (cuando este disponible)
- [ ] Multiples providers simultaneos
- [ ] Templates de specs
- [ ] Keyboard shortcuts

---

## Metricas de Exito

| Metrica | Target MVP | Target v1.0 |
|---------|------------|-------------|
| Repos agregados | 10 | 50 |
| Tasks creadas | 50 | 500 |
| % specs aprobadas sin editar | 40% | 70% |
| % PRs aprobados a la primera | 30% | 60% |

---

## PROGRESO DE IMPLEMENTACION

### Fase 0: Setup Screen - COMPLETADA

**Backend implementado:**
- `packages/server/src/routes/setup.ts` - Endpoints de setup
- `packages/server/src/services/ai-provider.service.ts` - Validacion de API keys Claude/OpenAI
- `packages/server/src/services/github-oauth.service.ts` - OAuth con GitHub

**Frontend implementado:**
- `packages/dashboard/src/features/setup/` - Feature completa
  - `components/setup-screen.tsx` - Pantalla principal
  - `components/ai-provider-card.tsx` - Cards para Claude/ChatGPT
  - `components/api-key-dialog.tsx` - Modal para API key
  - `components/github-connect.tsx` - Conexion GitHub
  - `components/setup-complete.tsx` - Pantalla de exito
  - `components/setup-guard.tsx` - Redireccion automatica
  - `hooks/use-setup-status.ts`, `use-validate-key.ts`, `use-github-oauth.ts`
  - `stores/setup-store.ts` - Zustand con persistencia

**Shared implementado:**
- `packages/shared/src/schemas/setup.schema.ts` - Schemas Zod
- `packages/shared/src/types/setup.types.ts` - TypeScript types

---

### Fase 1: Gestion de Repositorios - COMPLETADA

**Backend implementado:**
- `packages/server/src/routes/repos.ts` - CRUD + endpoints adicionales
- `packages/server/src/services/repo.service.ts` - Servicio CRUD
- `packages/server/src/services/stack-detector.service.ts` - Deteccion de stack
- `packages/server/src/services/github.service.ts` - API GitHub
- Tabla `repositories` en SQLite

**Frontend implementado:**
- `packages/dashboard/src/features/repos/` - Feature completa
  - `components/repo-list.tsx`, `repo-card.tsx`
  - `components/add-repo-dialog.tsx` - Agregar desde GitHub o URL
  - `components/repo-config-dialog.tsx` - Configuracion
  - `components/conventions-editor.tsx` - Editor markdown
  - `components/learned-patterns-list.tsx`
  - `hooks/use-repos.ts`, `use-repo.ts`, `use-repo-mutations.ts`, `use-github-repos.ts`
  - `stores/repo-store.ts` - Repo seleccionado
- Sidebar actualizado con lista de repos

**Shared implementado:**
- `packages/shared/src/schemas/repository.schema.ts`

---

### Fase 2: Sistema de Dos Agentes - COMPLETADA

**Backend implementado:**
- `packages/server/src/services/pm-agent.service.ts` - PM Agent completo
  - `generateSpec()` - Genera specs usando Claude/OpenAI
  - `regenerateSpec()` - Regenera con diferente enfoque
  - System prompt en espanol
  - Usa contexto del repo (stack, convenciones, patterns)
- `packages/server/src/services/dev-agent.service.ts` - Dev Agent completo
  - `executeSpec()` - Delega al AgentService existente
  - `cancelExecution()`, `getExecutionStatus()`
- `packages/server/src/routes/tasks.ts` - Endpoints actualizados
  - POST `/tasks/:id/generate-spec`
  - POST `/tasks/:id/regenerate-spec`
  - PATCH `/tasks/:id/spec`
  - POST `/tasks/:id/approve-spec`

**Shared implementado:**
- `packages/shared/src/schemas/task.schema.ts` - Actualizado con:
  - Nuevos estados: draft, refining, pending_approval, approved, coding, review, changes_requested, done, failed
  - Campos: user_input, generated_spec, final_spec, was_spec_edited, branch_name, pr_url, pr_number
  - Schemas: GenerateSpecRequest/Response, UpdateSpecRequest, ApproveSpecRequest/Response

**Frontend implementado:**
- Hooks:
  - `hooks/use-generate-spec.ts` - useGenerateSpec(), useRegenerateSpec()
  - `hooks/use-update-spec.ts` - useUpdateSpec()
  - `hooks/use-approve-spec.ts` - useApproveSpec()
- Componentes:
  - `components/spec-editor.tsx` - Editor de spec con acciones
  - `components/create-task-dialog.tsx` - Nuevo flujo (repo + idea)
  - `components/index.ts` - Exports actualizados
- Actualizaciones:
  - `task-detail.tsx` - Maneja nuevos estados, muestra SpecEditor y spinner
  - `task-actions.tsx` - Acciones para draft, refining, coding, review
  - `providers.tsx` - CreateTaskDialog reemplaza TaskFormDialog
  - `status-badge.tsx` - Colores para nuevos estados
  - `task-filters.tsx` - Filtros para nuevos estados

---

### Fase 3: Board View Kanban - COMPLETADA

**Frontend implementado:**
- `packages/dashboard/src/features/board/` - Feature completa
  - `components/board-view.tsx` - Vista principal con 5 columnas
  - `components/board-column.tsx` - Columna con titulo, color, contador
  - `components/board-card.tsx` - Card con estado, tiempo relativo, indicadores
  - `components/board-header.tsx` - Filtro por repo, boton nueva tarea
  - `hooks/use-board-tasks.ts` - Agrupa tareas por columna
- `packages/dashboard/src/app/board/page.tsx` - Pagina del board
- `packages/dashboard/src/app/page.tsx` - Redirige a /board

**Columnas implementadas:**
| Columna | Estados | Color |
|---------|---------|-------|
| Ideas | draft, refining, failed | Gris |
| Ready | pending_approval | Ambar |
| In Progress | approved, coding | Azul |
| Review | review, changes_requested | Purpura |
| Done | done | Verde |

**Caracteristicas:**
- Filtro por repositorio
- Indicador animado para tareas en progreso
- Tiempo relativo ("hace 2 min")
- Click en card abre detalle
- Responsive y dark mode

---

### Fase 4: Learning from Feedback - COMPLETADA

**Backend implementado:**
- `packages/server/src/services/repo.service.ts` - Metodo `deleteLearnedPattern()`
- `packages/server/src/routes/repos.ts` - Endpoint `DELETE /repos/:id/patterns/:patternId`

**Shared implementado:**
- `packages/shared/src/schemas/repository.schema.ts`:
  - `AddPatternRequestSchema`, `AddPatternResponseSchema`, `DeletePatternResponseSchema`

**Frontend implementado:**
- `packages/dashboard/src/features/repos/hooks/use-pattern-mutations.ts`:
  - `useAddPattern()` - Mutation para agregar patron
  - `useDeletePattern()` - Mutation para eliminar patron
- `packages/dashboard/src/features/tasks/components/pattern-suggestion.tsx`:
  - Se muestra cuando status === 'changes_requested'
  - Muestra comentarios del PR para contexto
  - Extrae automaticamente sugerencias de patrones
  - Permite editar texto antes de guardar
- `packages/dashboard/src/features/repos/components/learned-patterns-list.tsx`:
  - Actualizado con props `repoId` y `onDelete`
  - Boton eliminar individual con hover
  - Estados de loading y feedback
- `packages/dashboard/src/features/tasks/components/task-detail.tsx`:
  - Integrado PatternSuggestion en tab Overview
- `packages/dashboard/src/features/repos/components/repo-config-dialog.tsx`:
  - Integrado delete pattern handler

**Flujo implementado:**
1. Usuario pide cambios en PR (status -> changes_requested)
2. PatternSuggestion aparece mostrando comentarios
3. Usuario edita/confirma el patron
4. Pattern se guarda en el repo
5. PM Agent usa patterns en futuras specs

---

### Fase 5: Polish y Settings - COMPLETADA

**Backend implementado:**
- `packages/server/src/routes/data.ts` - Nuevos endpoints:
  - `GET /data/export` - Exporta todos los datos como JSON
  - `POST /data/import` - Importa datos desde JSON
  - `DELETE /data` - Borra todos los datos (requiere confirmacion)

**Frontend implementado:**
- `packages/dashboard/src/app/settings/page.tsx` - Pagina de settings
- `packages/dashboard/src/features/settings/`:
  - `stores/preferences-store.ts` - Store para preferencias (idioma)
  - `hooks/use-export-data.ts` - Hook para exportar
  - `hooks/use-import-data.ts` - Hook para importar
  - `hooks/use-delete-data.ts` - Hook para eliminar datos
  - `components/theme-selector.tsx` - Selector tema (claro/oscuro/sistema)
  - `components/language-selector.tsx` - Selector idioma specs
  - `components/connections-section.tsx` - Conexiones AI y GitHub
  - `components/preferences-section.tsx` - Preferencias
  - `components/data-section.tsx` - Export/import/delete
- `packages/dashboard/src/components/ui/radio-group.tsx` - Componente shadcn

**Funcionalidades:**
- Conexiones: Ver/cambiar/desconectar AI provider y GitHub
- Preferencias: Tema (next-themes), idioma de specs
- Datos: Exportar JSON, importar JSON, borrar todo (con confirmacion)

---

### Fase 6: OpenRouter - COMPLETADA

**Objetivo:** Soporte para modelos gratuitos de OpenRouter.

**Backend implementado:**
- `packages/server/src/services/ai-provider.service.ts`:
  - `validateOpenRouterKey()` - Valida API key
  - `getOpenRouterModels()` - Lista modelos disponibles
  - `callOpenRouter()` - Llama al modelo via API
  - `filterFreeModels()` - Filtra modelos gratuitos (precio = 0)
- `packages/server/src/routes/setup.ts`:
  - `POST /setup/validate-openrouter-key` - Valida key y retorna modelos
- `packages/server/src/services/pm-agent.service.ts`:
  - Soporte para OpenRouter como provider
  - `callOpenRouterProvider()` para generar specs

**Shared implementado:**
- `packages/shared/src/schemas/setup.schema.ts`:
  - `AIProviderSchema` incluye 'openrouter'
  - `OpenRouterModelSchema`, `OpenRouterPricingSchema`
  - `ValidateOpenRouterKeyRequest/Response`
  - `SetupConfigSchema` incluye `openRouterModel`
- `packages/shared/src/types/setup.types.ts`:
  - `AI_PROVIDER_INFO.openrouter`

**Frontend implementado:**
- `packages/dashboard/src/features/setup/stores/setup-store.ts`:
  - `setOpenRouterProvider()`, `availableModels`, `getOpenRouterModel()`
- `packages/dashboard/src/features/setup/hooks/use-validate-openrouter.ts`:
  - Hook para validar API key y conectar
- `packages/dashboard/src/features/setup/components/openrouter-card.tsx`:
  - Card con dialog de 2 pasos (API key + selector modelo)
- `packages/dashboard/src/features/setup/components/setup-screen.tsx`:
  - Muestra 3 cards: Claude, OpenAI, OpenRouter

**Caracteristicas:**
- Validacion de API key via /models
- Listado de modelos gratuitos (precio = 0)
- Selector de modelo en dialog
- Persistencia en localStorage
- UI consistente con otros providers

---

## Comandos para continuar

```bash
# Ejecutar el proyecto
npm run dev

# Build para verificar errores
npm run build

# Solo dashboard
npm run dev:dashboard

# Solo server
npm run dev:server
```

---

### Fase 7: Server-Side Storage Seguro - COMPLETADA

**Objetivo:** Almacenar API keys de forma segura en el servidor en lugar de localStorage.

**Backend implementado:**
- `packages/server/src/services/encryption.service.ts`:
  - Encriptación AES-256-GCM con ENCRYPTION_KEY de variable de entorno
  - Funciones `encrypt()` y `decrypt()`
- `packages/server/src/services/secrets.service.ts`:
  - `saveSecret()`, `getSecret()`, `deleteSecret()`, `hasSecret()`
  - `getSecretMetadata()` - Retorna metadata SIN exponer el valor
- `packages/server/src/routes/secrets.ts`:
  - `POST /secrets/ai` - Guardar API key de AI
  - `DELETE /secrets/ai` - Eliminar API key
  - `GET /secrets/ai/status` - Estado de conexión (sin exponer key)
  - `POST /secrets/github` - Guardar GitHub token (OAuth o PAT)
  - `DELETE /secrets/github` - Eliminar token
  - `GET /secrets/github/status` - Estado de conexión
  - `GET /secrets/status` - Estado general de todas las conexiones
- `packages/server/src/db/migrations.ts`:
  - Nueva tabla `user_secrets` con encriptación

**Frontend implementado:**
- `packages/dashboard/src/features/setup/stores/setup-store.ts`:
  - Ya NO guarda keys en localStorage
  - Solo guarda estado de conexión (conectado/desconectado)
  - Nuevos métodos: `setAIConnected()`, `setGitHubConnected()`, `clearAI()`, `clearGitHub()`
  - `checkConnectionStatus()` - Sincroniza con servidor
- `packages/dashboard/src/features/setup/hooks/use-secrets.ts`:
  - `useSaveAISecret()` - Guarda API key en servidor
  - `useDeleteAISecret()` - Elimina API key
  - `useSaveGitHubSecret()` - Guarda GitHub token
  - `useDeleteGitHubSecret()` - Elimina token
  - `useSecretsStatus()` - Obtiene estado de conexiones
- `packages/dashboard/src/features/setup/components/github-connect.tsx`:
  - Dos opciones: OAuth y Personal Access Token (PAT)
  - Usuario puede elegir el método que prefiera

**Shared implementado:**
- `packages/shared/src/schemas/secrets.schema.ts`:
  - Schemas para todos los endpoints de secrets

**Seguridad:**
- API keys encriptadas con AES-256-GCM
- ENCRYPTION_KEY en variable de entorno (.env)
- Frontend NUNCA recibe las keys, solo estado de conexión
- Validación de keys antes de guardar

---

## Proximos Pasos

**Todas las fases completadas!**

Posibles mejoras futuras (v1.1+):
- OAuth con Claude Pro (cuando este disponible)
- OAuth con ChatGPT Plus (cuando este disponible)
- Multiples providers simultaneos
- Templates de specs
- Keyboard shortcuts
- Drag & drop en board view
