'use client'

import { SetupScreen, SetupComplete, useSetupStatus } from '@/features/setup'

export default function SetupPage() {
  const { isComplete } = useSetupStatus()

  if (isComplete) {
    return <SetupComplete />
  }

  return <SetupScreen />
}
