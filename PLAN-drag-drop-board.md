# Plan: Drag & Drop de tareas draft → In Progress

## Context
El usuario quiere poder arrastrar tarjetas de tareas en estado `draft` hacia la columna "In Progress" del Kanban board para iniciar automáticamente el agente. Esto mejora el flujo de trabajo: en vez de abrir la tarea y hacer click en "Start", simplemente arrastra la tarjeta.

## Dependencia a instalar
- `@dnd-kit/core` - Core DnD library para React (composable, accessible, ligera)
- `@dnd-kit/utilities` - CSS transform utilities

## Archivos a modificar

### 1. `packages/dashboard/src/features/board/components/board-view.tsx`
- Envolver el board en `DndContext` con `PointerSensor` (activación con `distance: 8` para no interferir con clicks)
- Agregar estado `activeDragId` para trackear qué tarjeta se arrastra
- Handler `onDragStart`: guarda el id de la tarjeta activa
- Handler `onDragEnd`:
  - Verifica que el destino es la columna `inProgress`
  - Verifica que la tarea es `draft`
  - Llama a `startTask.mutate(taskId)` (hook existente `useStartTask`)
- `DragOverlay`: renderiza una copia visual de la `BoardCard` mientras se arrastra
- Import `useStartTask` de `../tasks/hooks/use-start-task`

### 2. `packages/dashboard/src/features/board/components/board-column.tsx`
- Envolver la columna con `useDroppable({ id: columnId })`
- Solo aceptar visualmente cuando `columnId === 'inProgress'` y hay un drag activo
- Visual feedback: `ring-2 ring-blue-500 bg-blue-500/5` cuando `isOver && columnId === 'inProgress'`

### 3. `packages/dashboard/src/features/board/components/board-card.tsx`
- Envolver las tarjetas draft con `useDraggable({ id: task.id, data: { task } })`
- Solo aplicar `useDraggable` cuando `task.status === 'draft'`
- Cuando `isDragging`: reducir opacidad (`opacity-50`)
- Agregar `cursor-grab` para tarjetas draft, `cursor-grabbing` durante drag
- El click existente para abrir drawer sigue funcionando gracias al `distance: 8` del sensor

## Flujo de usuario
1. Usuario ve tarjetas draft en la columna "Todo"
2. Agarra una tarjeta draft (cursor cambia a grab)
3. La arrastra hacia la columna "In Progress" (columna se ilumina con borde azul)
4. Suelta la tarjeta → se ejecuta `POST /api/tasks/:id/start`
5. La tarjeta se mueve a "In Progress" (via invalidación de queries) y el agente comienza

## Lo que NO cambia
- Click normal en tarjetas (abrir drawer) sigue funcionando
- Tarjetas en otros estados (no draft) NO son arrastrables
- Columnas que no son "In Progress" NO aceptan drops (no visual feedback)
- No se puede reordenar tarjetas dentro de una columna

## Verificación
1. `npm run build` compila sin errores
2. En el board: tarjetas draft muestran cursor grab
3. Arrastrar draft → "In Progress": la tarea inicia
4. Arrastrar draft → otra columna: nada pasa (no drop)
5. Click en tarjeta draft: abre drawer normalmente (no inicia drag)
6. Tarjetas no-draft: no son arrastrables
