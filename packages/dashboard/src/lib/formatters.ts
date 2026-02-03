/**
 * Format a date as relative time (e.g., "2 min ago", "1 hour ago", "yesterday")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const target = typeof date === 'string' ? new Date(date) : date
  const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000)

  if (diffInSeconds < 0) {
    return 'just now'
  }

  if (diffInSeconds < 60) {
    return 'just now'
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return diffInMinutes === 1 ? '1 min ago' : `${diffInMinutes} min ago`
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`
  }

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays === 1) {
    return 'yesterday'
  }

  if (diffInDays < 7) {
    return `${diffInDays} days ago`
  }

  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return diffInWeeks === 1 ? '1 week ago' : `${diffInWeeks} weeks ago`
  }

  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`
  }

  const diffInYears = Math.floor(diffInDays / 365)
  return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`
}

/**
 * Extract repository name from GitHub URL
 * e.g., "https://github.com/user/repo" -> "user/repo"
 * e.g., "https://github.com/user/repo.git" -> "user/repo"
 */
export function extractRepoName(repoUrl: string): string {
  try {
    const url = new URL(repoUrl)
    // Remove leading slash and trailing .git if present
    const pathname = url.pathname
      .replace(/^\//, '')
      .replace(/\.git$/, '')
    return pathname || repoUrl
  } catch {
    // If URL parsing fails, try to extract from the string directly
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?/)
    return match ? match[1] : repoUrl
  }
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Format a date as "Jan 15, 2025 at 3:45 PM"
 */
export function formatDate(date: string | Date): string {
  const target = typeof date === 'string' ? new Date(date) : date

  return target.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(',', ' at')
}
