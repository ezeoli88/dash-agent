import { toast as sonnerToast, type ExternalToast } from 'sonner'

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading'

interface ToastOptions extends ExternalToast {
  title?: string
  description?: string
}

function createToast(type: ToastType, options: ToastOptions | string) {
  const opts = typeof options === 'string' ? { title: options } : options
  const { title, description, ...rest } = opts

  const message = title || ''
  const toastOptions: ExternalToast = {
    ...rest,
    description,
  }

  switch (type) {
    case 'success':
      return sonnerToast.success(message, toastOptions)
    case 'error':
      return sonnerToast.error(message, toastOptions)
    case 'warning':
      return sonnerToast.warning(message, toastOptions)
    case 'info':
      return sonnerToast.info(message, toastOptions)
    case 'loading':
      return sonnerToast.loading(message, toastOptions)
    default:
      return sonnerToast(message, toastOptions)
  }
}

export const toast = {
  success: (options: ToastOptions | string) => createToast('success', options),
  error: (options: ToastOptions | string) => createToast('error', options),
  info: (options: ToastOptions | string) => createToast('info', options),
  warning: (options: ToastOptions | string) => createToast('warning', options),
  loading: (options: ToastOptions | string) => createToast('loading', options),
  dismiss: sonnerToast.dismiss,
  promise: sonnerToast.promise,
}

export function useToast() {
  return { toast }
}
