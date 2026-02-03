import { LoadingPage } from '@/components/shared/loading-page'

export default function Loading() {
  return (
    <LoadingPage
      message="Loading..."
      showLogo
      className="min-h-screen"
    />
  )
}
