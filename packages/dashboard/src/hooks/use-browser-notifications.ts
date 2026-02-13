import { useCallback, useEffect, useRef } from 'react'

type NotificationPermission = globalThis.NotificationPermission

interface BrowserNotificationOptions {
  /** Notification body text */
  body?: string
  /** Tag to replace existing notifications with the same tag */
  tag?: string
  /** Whether the notification should require user interaction to dismiss */
  requireInteraction?: boolean
}

interface UseBrowserNotificationsReturn {
  /**
   * Send a browser notification. No-op if permission is not granted.
   */
  sendNotification: (title: string, options?: BrowserNotificationOptions) => void
  /**
   * Manually request notification permission. Returns the resulting permission state.
   * Useful for triggering the permission prompt from a user interaction.
   */
  requestPermission: () => Promise<NotificationPermission>
}

/**
 * Hook for sending browser notifications via the Web Notifications API.
 *
 * - Automatically requests permission on mount (browsers may require a user gesture).
 * - Clicking a notification focuses the originating tab/window.
 * - Does not use Service Workers -- simple Notification API only.
 */
export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  // Request permission on mount. Browsers will silently ignore this if the user
  // has already granted/denied, or if a user gesture is required.
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      permissionRef.current = 'granted'
      return
    }
    if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((result) => {
        permissionRef.current = result
      })
    }
  }, [])

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof Notification === 'undefined') return 'denied'
    const result = await Notification.requestPermission()
    permissionRef.current = result
    return result
  }, [])

  const sendNotification = useCallback(
    (title: string, options?: BrowserNotificationOptions) => {
      // Guard: API not available or permission not granted
      if (typeof Notification === 'undefined') return
      if (permissionRef.current !== 'granted') return

      try {
        const notification = new Notification(title, {
          body: options?.body,
          tag: options?.tag,
          requireInteraction: options?.requireInteraction ?? false,
        })

        // Clicking the notification focuses the originating tab
        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      } catch {
        // Silently ignore -- some environments (e.g. insecure contexts) throw
      }
    },
    []
  )

  return { sendNotification, requestPermission }
}
