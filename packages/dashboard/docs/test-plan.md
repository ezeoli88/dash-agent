# dash-agent - Plan de Tests E2E

> **Estado:** Listo para ejecutar - Backend integrado
> **Generado con:** TestSprite
> **Fecha:** 2026-02-03
> **Actualizado:** 2026-02-03

---

## Resumen Ejecutivo

Este documento contiene el plan completo de tests E2E para dash-agent. El backend ya está integrado y todos los tests pueden ejecutarse contra el backend real.

### Estadísticas

| Métrica | Valor |
|---------|-------|
| Total de tests | 29 |
| Prioridad Alta | 17 |
| Prioridad Media | 11 |
| Prioridad Baja | 1 |

### Distribución por Categoría

| Categoría | Cantidad | Tests |
|-----------|----------|-------|
| Functional | 7 | TC001, TC003, TC011, TC015, TC018, TC028, TC030 |
| Integration | 6 | TC004, TC008, TC010, TC013, TC020, TC027 |
| Error Handling | 4 | TC002, TC005, TC009, TC024 |
| UI | 4 | TC007, TC012, TC016, TC017 |
| Accessibility | 3 | TC019, TC022, TC029 |
| Performance | 3 | TC014, TC025, TC026 |
| Security | 1 | TC023 |

---

## Plan de Implementación

### Fase 1: Setup (Prerequisitos)

```bash
# 1. Desde la raíz del monorepo, iniciar el backend (puerto 3000)
cd packages/server && npm run dev

# 2. En otra terminal, iniciar el dashboard (puerto 3003)
cd packages/dashboard && npm run dev -- -p 3003

# 3. Verificar conexión
curl http://localhost:3000/tasks  # Debe retornar JSON
curl http://localhost:3003        # Debe retornar HTML

# 4. Bootstrap TestSprite (desde Claude Code)
# mcp__TestSprite__testsprite_bootstrap con localPort=3003
```

### Fase 2: Smoke Tests (Implementar primero)

Tests críticos para validar que la aplicación funciona:

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 1 | TC001 | Task List carga correctamente |
| 2 | TC004 | Crear tarea (happy path) |
| 3 | TC006 | Task Detail muestra datos |
| 4 | TC010 | SSE conecta y muestra logs |
| 5 | TC013 | Diff viewer funciona |

### Fase 3: Tests de Integración

Tests que validan la comunicación con el backend:

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 6 | TC008 | Task Actions llaman APIs correctamente |
| 7 | TC009 | Manejo de errores de API |
| 8 | TC015 | Feedback se envía al agente |
| 9 | TC020 | API Client tipado correctamente |
| 10 | TC028 | Flujo completo de aprobación |

### Fase 4: Tests de UI y UX

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 11 | TC002 | Estados vacío y error |
| 12 | TC003 | Filtros y búsqueda |
| 13 | TC007 | Loading states por ruta |
| 14 | TC011 | Auto-reconnect SSE |
| 15 | TC012 | Auto-scroll y copiar logs |
| 16 | TC017 | Sidebar responsive |
| 17 | TC018 | Theme toggle |
| 18 | TC019 | Command palette |

### Fase 5: Tests de Calidad

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 19 | TC005 | Validación de formularios |
| 20 | TC016 | Contador de caracteres |
| 21 | TC022 | Accesibilidad (teclado) |
| 22 | TC023 | Seguridad XSS |
| 23 | TC024 | Error boundaries |
| 24 | TC029 | Command palette a11y |

### Fase 6: Tests de Performance

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 25 | TC014 | Diffs grandes |
| 26 | TC025 | Tiempos de carga |
| 27 | TC026 | Volumen alto de logs |

### Fase 7: Tests Adicionales (Opcional)

| Orden | Test ID | Descripción |
|-------|---------|-------------|
| 28 | TC027 | Retry y Extend |
| 29 | TC030 | Utilidades y formatters |

---

## Catálogo Completo de Tests

### TC001: Task List - Load and display tasks
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que Task List muestra skeletons durante la carga, luego muestra las tarjetas de tareas con badges de estado, info del repo y timestamps relativos.

**Pasos:**
1. Navegar a la página de Task List (`/tasks`)
2. **Aserción:** Observar que se muestran skeleton placeholders mientras carga
3. Mock API retorna lista de tareas con varios estados, URLs de repo y timestamps
4. **Aserción:** Verificar que cada tarjeta muestra badge de estado, owner/repo parseado de la URL, y timestamp relativo
5. **Aserción:** Confirmar que cada tarjeta muestra título y extracto de descripción

---

### TC002: Task List - Empty and error states
- **Prioridad:** Alta
- **Categoría:** Error Handling
- **Descripción:** Verificar que se muestra estado vacío cuando no hay tareas y estado de error cuando la API falla.

**Pasos:**
1. Navegar a Task List con mock API retornando array vacío
2. **Aserción:** Verificar que EmptyState se muestra con CTA para crear tarea
3. Recargar con mock API retornando error 500
4. **Aserción:** Verificar que se muestra estado de error con mensaje y botón retry

---

### TC003: Task List - Search and filters with debounce
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que el input de búsqueda tiene debounce, los filtros por estado funcionan y los resultados coinciden.

**Pasos:**
1. Abrir Task List con tareas que incluyen títulos 'Fix bug A', 'Add feature B' y estados 'backlog', 'in_progress', 'done'
2. Escribir 'Fix' en el input de búsqueda rápidamente y dejar de escribir
3. **Aserción:** Confirmar que la búsqueda tiene debounce y después del delay solo se muestran tareas con 'Fix'
4. Seleccionar filtro de estado 'in_progress'
5. **Aserción:** Verificar que solo aparecen tareas con estado 'in_progress' y la UI muestra estado de filtro activo

---

### TC004: Task Creation - Successful creation, validation, toast and redirect
- **Prioridad:** Alta
- **Categoría:** Integration
- **Descripción:** Verificar que el modal de Nueva Tarea valida inputs, llama a la API, muestra toast de éxito y redirige al detalle.

**Pasos:**
1. Abrir modal de Nueva Tarea desde Task List
2. Llenar título con 'Refactor X', descripción con al menos 10 chars, repo URL válida, branch 'main', agregar tag de archivo de contexto 'README.md', y comando de build opcional
3. Enviar el formulario
4. **Aserción:** Verificar que la validación client-side pasó y se llamó al endpoint create-task con el payload correcto
5. **Aserción:** Confirmar que se muestra toast de éxito y la UI redirige al detalle de la nueva tarea

---

### TC005: Task Creation - Client-side validation errors
- **Prioridad:** Alta
- **Categoría:** Error Handling
- **Descripción:** Verificar que la validación Zod/react-hook-form previene envío para inputs inválidos y muestra mensajes apropiados.

**Pasos:**
1. Abrir modal de Nueva Tarea
2. Dejar título vacío, descripción con menos de 10 caracteres, y repo URL como 'not-a-url'
3. Intentar enviar el formulario
4. **Aserción:** Verificar que se muestran errores de validación para título, descripción y repo URL, y no se llama a la API

---

### TC006: Task Detail - Render metadata, tabs, and PR URL
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que Task Detail muestra metadata, renderiza tabs Overview/Logs/Changes, y muestra PR URL clickeable.

**Pasos:**
1. Navegar a Task Detail con datos que incluyen branch, fechas, build command, context files y pr_url
2. **Aserción:** Verificar que la sección de metadata lista branch, build command, tags de archivos de contexto y timestamps relativos
3. **Aserción:** Confirmar que los tabs Overview, Logs, Changes son visibles y clickeables
4. **Aserción:** Confirmar que el PR URL se renderiza como link que abre en nueva pestaña con atributos rel apropiados

---

### TC007: Task Detail - Per-route loading and error boundaries
- **Prioridad:** Media
- **Categoría:** UI
- **Descripción:** Verificar que aparecen skeletons de loading durante fetches de tabs y error boundaries muestran alertas.

**Pasos:**
1. Abrir Task Detail y click en tab Changes mientras la API de changes responde lento
2. **Aserción:** Confirmar que se muestra skeleton de loading a nivel de tab
3. Simular que la API de changes retorna error 500
4. **Aserción:** Verificar que un error boundary dentro del tab Changes muestra alerta destructiva con opción de retry

---

### TC008: Task Actions - Availability by status and API calls
- **Prioridad:** Alta
- **Categoría:** Integration
- **Descripción:** Verificar que los botones de acción aparecen solo para estados permitidos, abren diálogos de confirmación y llaman APIs correctas.

**Pasos:**
1. Abrir Task Detail para tarea en estado 'backlog'
2. **Aserción:** Verificar que botón 'Execute' es visible y 'Cancel'/'Approve' no son visibles
3. Click en 'Execute' y confirmar si se requiere
4. **Aserción:** Verificar que se llama al endpoint execute y el botón muestra estado de loading
5. Cambiar estado de tarea a 'awaiting_review' y recargar detalle
6. **Aserción:** Verificar que botón 'Approve' es visible y requiere confirmación; al aprobar, se llama a la API y el estado transiciona

---

### TC009: Task Actions - Handling API errors and toasts
- **Prioridad:** Alta
- **Categoría:** Error Handling
- **Descripción:** Verificar que errores de API durante acciones se muestran como toasts de error.

**Pasos:**
1. Abrir Task Detail donde 'Cancel' está disponible (ej. in_progress)
2. Click en 'Cancel' y confirmar para disparar la API
3. Simular que cancel API retorna error 500
4. **Aserción:** Verificar que se muestra toast de error con mensaje amigable y el botón 'Cancel' ya no está en estado loading

---

### TC010: Real-time Logs (SSE) - Connect, stream events, and color coding
- **Prioridad:** Alta
- **Categoría:** Integration
- **Descripción:** Verificar que el hook SSE conecta, transmite eventos de log de diferentes niveles con colores y timestamps.

**Pasos:**
1. Abrir Task Detail y cambiar al tab Logs para una tarea en ejecución
2. Mock SSE stream: enviar eventos de tipos log (level: info), log (level: warn), log (level: error), log (agent), y log (user)
3. **Aserción:** Verificar que cada entrada de log aparece con colores apropiados por nivel y timestamps formateados consistentemente
4. **Aserción:** Confirmar que el indicador de estado de conexión muestra 'connected'

---

### TC011: Real-time Logs (SSE) - Auto-reconnect behavior
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que el hook SSE intenta reconexión al desconectarse inesperadamente.

**Pasos:**
1. Abrir tab Logs con SSE conectado
2. Simular cierre abrupto de conexión SSE
3. **Aserción:** Confirmar que el estado de conexión cambia a 'disconnected' y se programa reconexión automática (~3s)
4. Permitir intento de reconexión y simular que el servidor acepta
5. **Aserción:** Verificar que el estado vuelve a 'connected' y el streaming de logs se reanuda

---

### TC012: Real-time Logs - Auto-scroll toggle, copy and clear logs
- **Prioridad:** Media
- **Categoría:** UI
- **Descripción:** Verificar que el toggle de auto-scroll controla el comportamiento, copy copia logs y clear los limpia.

**Pasos:**
1. Abrir tab Logs con muchos eventos entrantes
2. Deshabilitar auto-scroll via toggle
3. Enviar eventos SSE adicionales
4. **Aserción:** Verificar que la vista de logs no hace auto-scroll y preserva la posición del usuario
5. Click en 'Copy logs'
6. **Aserción:** Confirmar que el clipboard contiene los logs en formato texto plano
7. Click en 'Clear logs'
8. **Aserción:** Verificar que los logs visibles se eliminan mientras SSE continúa recibiendo eventos

---

### TC013: Diff Viewer - File list, stats, unified/split toggle and syntax highlighting
- **Prioridad:** Alta
- **Categoría:** Integration
- **Descripción:** Verificar que el tab Changes lista archivos, muestra stats, toggle entre vistas y syntax highlighting.

**Pasos:**
1. Abrir Task Detail y navegar al tab Changes con múltiples cambios de archivos (added/modified/deleted) en diferentes lenguajes
2. **Aserción:** Confirmar que la lista de archivos muestra cada archivo con badge de tipo de cambio y conteos
3. Seleccionar un archivo y cambiar a vista 'Split'
4. **Aserción:** Verificar que el diff split renderiza paneles izquierdo/derecho con syntax highlighting y números de línea
5. Cambiar a tema dark via Theme toggle
6. **Aserción:** Confirmar que syntax highlighting se adapta a colores del tema oscuro

---

### TC014: Diff Viewer - Large file diffs performance and virtualization
- **Prioridad:** Media
- **Categoría:** Performance
- **Descripción:** Verificar que el diff viewer maneja diffs muy grandes sin bloquear el main thread.

**Pasos:**
1. Abrir tab Changes con mock diff conteniendo miles de líneas
2. **Aserción:** Verificar que el tiempo de render inicial es aceptable y se usa virtualización
3. Hacer scroll rápido a través del diff
4. **Aserción:** Confirmar scroll suave y que las líneas se renderizan correctamente al entrar en vista

---

### TC015: Feedback System - Send feedback during execution and keyboard shortcut
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que el formulario de feedback funciona, Ctrl+Enter envía, aparece en historial y logs.

**Pasos:**
1. Abrir Task Detail con tab Logs activo para tarea en 'in_progress'
2. Escribir mensaje de feedback dentro del límite de caracteres
3. Presionar Ctrl/Cmd+Enter para enviar
4. **Aserción:** Verificar que se llama a la API de feedback y se muestra confirmación/toast
5. **Aserción:** Confirmar que el nuevo feedback aparece en el historial y como entrada de log tipo user

---

### TC016: Feedback System - Character counter and max length enforcement
- **Prioridad:** Media
- **Categoría:** UI
- **Descripción:** Verificar que el contador de caracteres muestra caracteres restantes y previene exceder el límite.

**Pasos:**
1. Abrir formulario de Feedback y escribir hasta el máximo de caracteres permitidos
2. Intentar pegar un string que excede el máximo
3. **Aserción:** Confirmar que el campo trunca o bloquea caracteres adicionales y se muestra mensaje de validación

---

### TC017: Layout & Navigation - Responsive sidebar and mobile nav sheet
- **Prioridad:** Media
- **Categoría:** UI
- **Descripción:** Verificar que el sidebar colapsa en viewports pequeños, el estado persiste y hay indicador de progreso de navegación.

**Pasos:**
1. Abrir app en viewport desktop, colapsar sidebar, navegar a una tarea; recargar
2. **Aserción:** Confirmar que el estado colapsado persiste después de recargar
3. Cambiar a viewport móvil y abrir la app
4. **Aserción:** Verificar que el sidebar es reemplazado por sheet de navegación móvil
5. Click en link de navegación
6. **Aserción:** Confirmar que se muestra indicador de progreso durante la transición

---

### TC018: Theme System - Toggle dark/light/system and persist preference
- **Prioridad:** Media
- **Categoría:** Functional
- **Descripción:** Verificar que el toggle de tema cambia entre light, dark y system; la preferencia persiste.

**Pasos:**
1. Abrir Theme toggle y configurar a 'Dark'
2. **Aserción:** Confirmar que la UI cambia a estilos oscuros y persiste en localStorage
3. Recargar la página
4. **Aserción:** Verificar que el tema oscuro persiste
5. Configurar tema a 'System' y simular cambio de tema del OS
6. **Aserción:** Confirmar que la app sigue el cambio de tema del sistema

---

### TC019: Command Palette - Open with keyboard, search tasks, and quick actions
- **Prioridad:** Media
- **Categoría:** Accessibility
- **Descripción:** Verificar que el command palette abre con Cmd/Ctrl+K, puede buscar tareas y ejecutar acciones rápidas.

**Pasos:**
1. Presionar Cmd/Ctrl+K en cualquier página
2. **Aserción:** Confirmar que el overlay del command palette abre y el focus está en el input
3. Escribir parte del título de una tarea y seleccionar un resultado
4. **Aserción:** Verificar que se navega al detalle de la tarea seleccionada
5. Abrir palette y seleccionar acción rápida 'Toggle Theme'
6. **Aserción:** Confirmar que el tema cambia como se espera

---

### TC020: API Client - Typed contract enforcement and error surface
- **Prioridad:** Alta
- **Categoría:** Integration
- **Descripción:** Verificar que los métodos del API client usan payloads tipados y surfacean errores de red.

**Pasos:**
1. Disparar flujo de crear tarea que llama al método createTask del API client
2. **Aserción:** Confirmar que la forma del payload coincide con los tipos TypeScript
3. Simular fallo de red para un fetch del API client
4. **Aserción:** Verificar que el API client surfacea el error a la capa UI y se muestra toast/alerta

---

### TC022: Accessibility - Keyboard navigation and ARIA roles
- **Prioridad:** Alta
- **Categoría:** Accessibility
- **Descripción:** Verificar que la navegación por teclado funciona y hay atributos ARIA apropiados.

**Pasos:**
1. Navegar por la app usando solo teclado (Tab, Shift+Tab, Enter, Arrow keys) desde Task List
2. **Aserción:** Confirmar que el orden de focus es lógico, elementos focuseables son alcanzables y hay estilos de focus visibles
3. Abrir modal de Nueva Tarea y asegurar que el focus queda atrapado en el modal
4. **Aserción:** Verificar que existen roles/labels ARIA para campos de form, modal, contenedor de logs y diff viewer

---

### TC023: Security - Prevent XSS in logs and diffs
- **Prioridad:** Alta
- **Categoría:** Security
- **Descripción:** Verificar que los mensajes de log y contenido de diff están sanitizados para prevenir XSS.

**Pasos:**
1. Enviar mock SSE log y contenido diff con snippets HTML/JS diseñados para intentar XSS
2. **Aserción:** Confirmar que la UI renderiza estas entradas escapadas (sin ejecución de script) mientras muestra el texto de código con syntax highlighting

---

### TC024: Error Boundary - App-level error handling and fallback UI
- **Prioridad:** Media
- **Categoría:** Error Handling
- **Descripción:** Verificar que el Error boundary a nivel de app captura errores de renderizado y muestra fallback usable.

**Pasos:**
1. Introducir un error de render en runtime en un componente hijo
2. **Aserción:** Confirmar que Error Boundary captura el error y muestra UI de fallback con explicación y acciones para volver o retry

---

### TC025: Performance - Page load and navigation timing targets
- **Prioridad:** Media
- **Categoría:** Performance
- **Descripción:** Verificar que la carga inicial y transiciones de navegación cumplen objetivos de rendimiento.

**Pasos:**
1. Cargar Task List bajo condiciones de red simuladas (broadband típico)
2. **Aserción:** Medir y asegurar que el contenido inicial renderiza en menos de 3 segundos
3. Navegar de Task List a Task Detail
4. **Aserción:** Confirmar que la transición completa en menos de 500ms

---

### TC026: Logs - Large volume handling and virtualization
- **Prioridad:** Alta
- **Categoría:** Performance
- **Descripción:** Verificar que la vista de Logs permanece responsiva con streams de alta velocidad.

**Pasos:**
1. Simular SSE enviando cientos de mensajes de log por segundo
2. **Aserción:** Confirmar que la UI permanece responsiva, el uso de memoria es limitado y mensajes viejos son virtualizados o podados

---

### TC027: Task Retry and Extend - Workflow and API integration
- **Prioridad:** Media
- **Categoría:** Integration
- **Descripción:** Verificar que las acciones Retry y Extend están disponibles por estado y llaman APIs correctas.

**Pasos:**
1. Abrir Task Detail en estado 'failed' y click en 'Retry'
2. **Aserción:** Confirmar diálogo de confirmación y al confirmar, se llama a retry API y el estado transiciona
3. Abrir Task Detail en 'in_progress' y click en 'Extend'
4. **Aserción:** Verificar que se llama a extend API y la UI muestra tiempo estimado actualizado

---

### TC028: Changes - Approve flow results in PR URL and status transition
- **Prioridad:** Alta
- **Categoría:** Functional
- **Descripción:** Verificar que aprobar cambios transiciona la tarea y genera PR URL.

**Pasos:**
1. Abrir tab Changes para tarea en 'awaiting_review' y click en 'Approve'. Confirmar en diálogo
2. **Aserción:** Confirmar que se llama al endpoint approve y la UI muestra feedback de progreso, luego actualiza estado a 'approved' y 'done'
3. **Aserción:** Verificar que aparece campo de PR URL en metadata como link válido clickeable

---

### TC029: Command Palette - Accessibility and focus management
- **Prioridad:** Media
- **Categoría:** Accessibility
- **Descripción:** Verificar que el Command Palette es accesible para screen readers y maneja focus correctamente.

**Pasos:**
1. Disparar Command Palette con teclado e interactuar para seleccionar acción, luego cerrar
2. **Aserción:** Confirmar atributos ARIA como role='dialog' y aria-modal, el input tiene aria-label
3. Antes de abrir palette enfocar un botón, abrir y cerrar el palette sin realizar acción
4. **Aserción:** Verificar que el focus vuelve al botón previamente enfocado

---

### TC030: Utilities - Repo parsing and formatters edge cases
- **Prioridad:** Baja
- **Categoría:** Functional
- **Descripción:** Verificar que el parsing de repo URL y formatters manejan casos edge correctamente.

**Pasos:**
1. Llamar utilidad de parsing de repo con inputs variados: URLs válidas e inválidas
2. **Aserción:** Confirmar que inputs válidos retornan owner y repo correctos, inputs inválidos retornan null sin excepciones
3. Llamar formatter de fecha/hora con timestamps pasados, presentes, futuros y diferentes locales
4. **Aserción:** Verificar que los outputs formateados son sensibles y no crashean con valores inesperados

---

## Comandos de Ejecución

### Bootstrap TestSprite
```
Desde Claude Code, ejecutar:
mcp__TestSprite__testsprite_bootstrap
- localPort: 3003
- type: frontend
- projectPath: C:\ezequiel\dashboard-agentic\packages\dashboard
- testScope: codebase
- pathname: /tasks
```

### Generar y Ejecutar Tests
```
mcp__TestSprite__testsprite_generate_code_and_execute
- projectName: dashboard
- projectPath: C:\ezequiel\dashboard-agentic\packages\dashboard
- testIds: [] (vacío para todos, o array de IDs específicos)
- additionalInstruction: ""
```

### Ejecutar Tests Específicos (Smoke Tests)
```
testIds: ["TC001", "TC004", "TC006", "TC010", "TC013"]
```

### Re-ejecutar Tests
```
mcp__TestSprite__testsprite_rerun_tests
- projectPath: C:\ezequiel\dashboard-agentic\packages\dashboard
```

### Abrir Dashboard de Resultados
```
mcp__TestSprite__testsprite_open_test_result_dashboard
- projectPath: C:\ezequiel\dashboard-agentic\packages\dashboard
```

---

## Checklist Pre-Ejecución

- [ ] Backend API corriendo en puerto 3000 (`packages/server`)
- [ ] Dashboard corriendo en puerto 3003 (`packages/dashboard`)
- [ ] Variables de entorno configuradas (`packages/dashboard/.env.local`)
- [ ] Verificar conexión: `curl http://localhost:3000/tasks` retorna JSON
- [ ] SSE endpoint funcional: `curl http://localhost:3000/tasks/:id/logs`

---

## Notas Adicionales

### Arquitectura del Proyecto
```
dash-agent/
├── packages/
│   ├── dashboard/     # Frontend Next.js (puerto 3003)
│   ├── server/        # Backend Express (puerto 3000)
│   └── shared/        # Tipos compartidos (@dash-agent/shared)
```

### Todos los Tests Requieren Backend Real
Los mocks fueron eliminados del proyecto. Todos los tests se ejecutan contra el backend real en `http://localhost:3000`.

### Tests Críticos (Smoke Tests)
Ejecutar primero para validar la integración básica:
- TC001: Task List carga
- TC004: Crear tarea
- TC006: Task Detail
- TC010: SSE logs
- TC013: Diff viewer
