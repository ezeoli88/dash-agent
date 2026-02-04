/**
 * Query keys for repository-related queries
 */
export const repoKeys = {
  all: ['repos'] as const,
  lists: () => [...repoKeys.all, 'list'] as const,
  list: () => [...repoKeys.lists()] as const,
  details: () => [...repoKeys.all, 'detail'] as const,
  detail: (id: string) => [...repoKeys.details(), id] as const,
  github: ['github-repos'] as const,
  githubList: (search?: string) => [...repoKeys.github, 'list', search ?? ''] as const,
}
