# dash-agent

Dashboard web para gestionar tareas de un agente IA autónomo. Permite crear tareas, monitorear su ejecución en tiempo real via SSE, enviar feedback al agente, revisar cambios (diff) y aprobar la creación de PRs.

## Features

- **Task Management** - Crear, listar y gestionar tareas para el agente IA
- **Real-time Logs** - Streaming de logs de ejecución via Server-Sent Events (SSE)
- **Diff Viewer** - Revisar cambios de código antes de aprobarlos
- **Feedback Loop** - Enviar feedback al agente durante la ejecución
- **PR Creation** - Crear Pull Requests en GitHub automáticamente
- **Dark Mode** - Soporte completo para tema claro/oscuro

## Quick Start

```bash
# Clonar el repositorio
git clone https://github.com/your-username/dash-agent.git
cd dash-agent

# Instalar dependencias
npm install

# Configurar variables de entorno
cp packages/server/.env.example packages/server/.env
# Editar .env con tu OPENAI_API_KEY y GITHUB_TOKEN

# Iniciar en modo desarrollo
npm run dev
```

El dashboard estará disponible en `http://localhost:3003` y el servidor en `http://localhost:3000`.

## Project Structure

```
dash-agent/
├── packages/
│   ├── cli/              # CLI entry point (futuro)
│   ├── dashboard/        # Next.js frontend
│   ├── server/           # Express backend API
│   └── shared/           # Tipos y schemas compartidos
├── package.json          # Root workspace
├── CLAUDE.md             # Instrucciones para Claude
└── integration-plan.md   # Plan de publicación npm
```

## Tech Stack

### Frontend (packages/dashboard/)

| Tecnología | Versión | Por qué esta elección |
|------------|---------|----------------------|
| **Next.js** | 16.1 | App Router moderno con React Server Components. Optimizaciones automáticas de imágenes, fuentes y bundles. Mejor SEO out-of-the-box. File-based routing simplifica la estructura del proyecto. |
| **React** | 19.2 | Última versión estable con Concurrent Features habilitados. Mejoras significativas de rendimiento con el nuevo compilador. Suspense boundaries para mejor UX en loading states. |
| **TypeScript** | 5.x (strict) | Type safety end-to-end elimina categorías enteras de bugs. IntelliSense superior en el IDE. Refactoring seguro. El modo strict previene errores comunes como `null` y `undefined`. |
| **Tailwind CSS** | 4.x | Utility-first permite desarrollo rápido sin context-switching a archivos CSS. Purge automático genera bundles mínimos. La nueva versión 4 tiene mejor performance y CSS nesting nativo. |
| **shadcn/ui** | - | No es una dependencia, es código copiado al proyecto. Componentes accesibles (ARIA) basados en Radix UI. Totalmente personalizables. Sin vendor lock-in. |
| **TanStack Query** | 5.x | Cache automático con stale-while-revalidate. Deduplicación de requests idénticos. Refetch automático en window focus. Optimistic updates. DevTools excelentes. |
| **Zustand** | 5.x | Estado cliente minimalista sin boilerplate. API simple (solo hooks). Middleware extensible. Persist to localStorage trivial. Mucho más simple que Redux para este caso de uso. |
| **next-themes** | 0.4 | Dark mode sin flash en SSR. Detecta preferencia del sistema. Persiste elección del usuario. Integración perfecta con Tailwind. |

### Backend (packages/server/)

| Tecnología | Versión | Por qué esta elección |
|------------|---------|----------------------|
| **Express** | 4.x | Framework maduro y battle-tested. Ecosistema extenso de middlewares. Curva de aprendizaje mínima. Suficientemente flexible para SSE y APIs REST. |
| **TypeScript** | 5.x | Mismas ventajas que en frontend. Tipos compartidos con el paquete `shared` aseguran consistencia API. |
| **sql.js** | 1.10 | SQLite compilado a WebAssembly. Zero dependencies nativas (no requiere Python/node-gyp). Funciona en cualquier plataforma. Base de datos embebida, no requiere servidor externo. Ideal para un CLI portable. |
| **OpenAI SDK** | 6.x | SDK oficial con tipos TypeScript. Soporte nativo para streaming responses. Tool calling para function calling del agente. Retry automático con exponential backoff. |
| **Octokit** | 5.x | SDK oficial de GitHub. Type-safe con autocompletado de endpoints. Pagination automática. Rate limiting handling incluido. |
| **Zod** | 4.x | Validación runtime + inferencia TypeScript. Define el schema una vez, obtén tipo y validador. Mensajes de error claros. Composable para schemas complejos. |

### Shared (packages/shared/)

| Tecnología | Por qué esta elección |
|------------|----------------------|
| **Zod** | Single source of truth para tipos y validación. El frontend y backend comparten los mismos schemas. Cambios en la API se detectan en compile-time. |
| **npm workspaces** | Solución nativa sin herramientas adicionales (no Lerna/Turborepo). Symlinks automáticos entre paquetes. `npm install` una vez para todo el monorepo. |

### Decisiones Arquitectónicas

#### Por qué Monorepo con Workspaces

```
✓ Tipos compartidos entre frontend y backend
✓ Un solo npm install para todo el proyecto
✓ Cambios de API detectados en compile-time
✓ Desarrollo local simplificado
✓ Deploy coordinado de versiones
```

#### Por qué SSE en lugar de WebSockets

```
✓ Unidireccional (server → client) es suficiente para logs
✓ HTTP estándar, funciona con cualquier proxy/CDN
✓ Reconexión automática nativa del browser
✓ Más simple de implementar y debuggear
✓ Menor overhead que WebSockets para este caso de uso
```

#### Por qué SQLite (sql.js) en lugar de PostgreSQL/MySQL

```
✓ Zero configuración - no hay servidor de DB que instalar
✓ Portable - funciona igual en Windows/Mac/Linux
✓ Suficiente para un dashboard de tareas (no es high-traffic)
✓ Ideal para un CLI que se pueda distribuir vía npm
✓ Sin dependencies nativas gracias a WebAssembly
```

#### Por qué shadcn/ui en lugar de Material UI/Chakra

```
✓ Código es tuyo - copias los componentes, no instalas librería
✓ Sin vendor lock-in - personaliza libremente
✓ Basado en Radix - accesibilidad profesional
✓ Tailwind nativo - consistente con el resto del proyecto
✓ Bundle más pequeño - solo incluye lo que usas
```

## Commands

```bash
# Instalar dependencias
npm install

# Desarrollo (server + dashboard concurrentemente)
npm run dev

# Build de producción
npm run build

# Build por paquete
npm run build:shared
npm run build:server
npm run build:dashboard

# Dev por paquete
npm run dev:server      # Solo backend (puerto 3000)
npm run dev:dashboard   # Solo frontend (puerto 3003)

# Linting
npm run lint
```

## Environment Variables

### Server (packages/server/.env)

```env
# Requerido: API Key de OpenAI para el agente
OPENAI_API_KEY=sk-your-openai-api-key

# Opcional: Token de GitHub para crear PRs
GITHUB_TOKEN=ghp_your-github-token

# Configuración del servidor
PORT=3000

# Base de datos
DATABASE_PATH=./data/dash-agent.db

# Repositorios
REPOS_BASE_DIR=./repos
WORKTREES_DIR=./worktrees

# Logging
LOG_LEVEL=info
```

### Dashboard (packages/dashboard/.env.local)

```env
# URL del backend API
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tasks` | Listar todas las tareas |
| POST | `/api/tasks` | Crear nueva tarea |
| GET | `/api/tasks/:id` | Obtener tarea por ID |
| PATCH | `/api/tasks/:id` | Actualizar tarea |
| DELETE | `/api/tasks/:id` | Eliminar tarea |
| GET | `/api/tasks/:id/logs` | SSE stream de logs |
| POST | `/api/tasks/:id/feedback` | Enviar feedback |
| GET | `/api/tasks/:id/diff` | Obtener diff de cambios |
| POST | `/api/tasks/:id/approve` | Aprobar y crear PR |

## Roadmap

- [x] Phase 1: Setup inicial
- [x] Phase 2: Componentes UI (shadcn/ui)
- [x] Phase 3: Layout y navegación
- [x] Phase 4: Lista de tareas
- [x] Phase 5: Detalle de tarea
- [x] Phase 6: Crear tarea
- [x] Phase 7: Acciones de tarea
- [x] Phase 8: Logs en tiempo real (SSE)
- [x] Phase 9: Diff Viewer
- [x] Phase 10: Sistema de feedback
- [x] Phase 11: Polish
- [ ] Phase 12: Refactoring
- [ ] Phase 13: Testing
- [ ] Phase 14: CLI (`npx dash-agent`)
- [ ] Phase 15: Publicación npm

## Contributing

1. Fork el repositorio
2. Crear una rama (`git checkout -b feature/amazing-feature`)
3. Commit cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abrir un Pull Request

## License

MIT

---

Built with [Next.js](https://nextjs.org/), [Express](https://expressjs.com/), and [OpenAI](https://openai.com/)
