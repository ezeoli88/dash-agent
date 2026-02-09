'use client'

import { useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function NavigationProgress() {
  const { pathname, search } = useLocation()
  const [isNavigating, setIsNavigating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Reset when navigation completes
    setIsNavigating(false)
    setProgress(100)

    const timeout = setTimeout(() => {
      setProgress(0)
    }, 200)

    return () => clearTimeout(timeout)
  }, [pathname, search])

  // Listen for navigation start events
  useEffect(() => {
    const handleStart = () => {
      setIsNavigating(true)
      setProgress(30)

      // Simulate progress
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval)
            return prev
          }
          return prev + 10
        })
      }, 100)

      return () => clearInterval(interval)
    }

    // Use click event on links to detect navigation start
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      if (link && link.href && !link.target && !link.download) {
        const url = new URL(link.href)
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          handleStart()
        }
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [pathname])

  if (!isNavigating && progress === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] h-0.5 bg-transparent',
        'transition-opacity duration-200',
        isNavigating ? 'opacity-100' : 'opacity-0'
      )}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Navigation progress"
    >
      <div
        className={cn(
          'h-full bg-primary',
          'transition-all duration-200 ease-out'
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
