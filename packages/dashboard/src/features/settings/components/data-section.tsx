'use client'

import { useState, useRef } from 'react'
import { Download, Upload, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useExportData, useImportData, useDeleteData } from '../hooks'

/**
 * Data section with export, import, and delete functionality
 */
export function DataSection({ id }: { id?: string }) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { exportData, isExporting } = useExportData()
  const { importData, isImporting } = useImportData()
  const { deleteAllData, isDeleting } = useDeleteData()

  const handleExport = async () => {
    try {
      const data = await exportData()
      toast.success('Datos exportados', {
        description: `${data.tasks.length} tareas, ${data.repositories.length} repositorios`,
      })
    } catch {
      toast.error('Error al exportar', {
        description: 'No se pudieron exportar los datos',
      })
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await importData(file)
      toast.success('Datos importados', {
        description: `${result.imported.tasks} tareas, ${result.imported.repositories} repositorios`,
      })
    } catch (err) {
      toast.error('Error al importar', {
        description: err instanceof Error ? err.message : 'No se pudieron importar los datos',
      })
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDeleteClick = () => {
    setDeleteConfirmation('')
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirmation !== 'BORRAR') return

    try {
      const result = await deleteAllData()
      toast.success('Datos eliminados', {
        description: `${result.deleted.tasks} tareas, ${result.deleted.repositories} repositorios eliminados`,
      })
      setIsDeleteDialogOpen(false)
    } catch {
      toast.error('Error al eliminar', {
        description: 'No se pudieron eliminar los datos',
      })
    }
  }

  return (
    <>
      <Card id={id}>
        <CardHeader>
          <CardTitle className="text-lg">Datos</CardTitle>
          <CardDescription>
            Exporta, importa o elimina todos los datos de la aplicacion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              Exportar datos
            </Button>

            <Button
              variant="outline"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Importar datos
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />

            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDeleteClick}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Borrar todo
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            El archivo exportado incluye todas las tareas, repositorios y logs de la aplicacion.
          </p>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Borrar todos los datos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion es irreversible. Se eliminaran todas las tareas, repositorios
              y logs de la aplicacion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="delete-confirmation">
              Escribe <span className="font-bold">BORRAR</span> para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="BORRAR"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteConfirmation !== 'BORRAR' || isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar todo'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
