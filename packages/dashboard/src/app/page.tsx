'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRepos } from '@/features/repos/hooks/use-repos'

export default function HomePage() {
  const router = useRouter()
  const { data: repos, isLoading } = useRepos()

  useEffect(() => {
    if (isLoading) return
    if (!repos || repos.length === 0) {
      router.replace('/repos')
    } else {
      router.replace('/board')
    }
  }, [repos, isLoading, router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}
