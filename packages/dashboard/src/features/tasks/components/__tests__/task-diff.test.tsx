import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@/test/test-utils'
import { renderWithProviders } from '@/test/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw-server'
import { TaskDiff } from '../task-diff'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock auth to avoid sessionStorage issues in jsdom
vi.mock('@/lib/auth', () => ({
  getAuthToken: vi.fn(() => null),
}))

// Mock react-diff-viewer-continued (not compatible with jsdom)
vi.mock('react-diff-viewer-continued', () => ({
  default: (props: { oldValue?: string; newValue?: string }) => (
    <div data-testid="diff-viewer">
      {props.oldValue || props.newValue ? 'diff content' : ''}
    </div>
  ),
  DiffMethod: { WORDS: 'WORDS' },
}))

// Mock next-themes to provide theme context
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TASK_ID = 'task-diff-1'

const mockChangesWithSummary = {
  files: [
    {
      path: 'src/index.ts',
      status: 'modified' as const,
      additions: 10,
      deletions: 3,
      oldContent: 'const x = 1;\nconst y = 2;\nconst z = 3;',
      newContent:
        'const x = 2;\nimport { foo } from "bar";\nconst y = 2;\nexport const z = 3;',
    },
    {
      path: 'src/utils/helpers.ts',
      status: 'added' as const,
      additions: 25,
      deletions: 0,
      newContent: 'export function helper() { return true; }',
    },
    {
      path: 'src/legacy/old.ts',
      status: 'deleted' as const,
      additions: 0,
      deletions: 15,
      oldContent: 'export const old = "deprecated";',
    },
  ],
  diff: '@@ -1 +1,2 @@\n-const x = 1;\n+const x = 2;',
  summary: {
    totalAdditions: 35,
    totalDeletions: 18,
    filesChanged: 3,
  },
}

const mockChangesWithoutSummary = {
  files: [
    {
      path: 'src/app.ts',
      status: 'modified' as const,
      additions: 5,
      deletions: 2,
      oldContent: 'const app = "v1";',
      newContent: 'const app = "v2";',
    },
    {
      path: 'src/config.ts',
      status: 'added' as const,
      additions: 8,
      deletions: 0,
      newContent: 'export const config = {};',
    },
  ],
  diff: '@@ -1 +1 @@\n-const app = "v1";\n+const app = "v2";',
  // summary intentionally omitted to test computed fallback
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskDiff', () => {
  it('shows loading skeleton while fetching', () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        // Never resolve - keeps loading state
        return new Promise(() => {})
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    // The skeleton should be visible (multiple Skeleton elements exist in the loading state)
    // Verify by checking the skeleton container structure is present
    // The skeleton has Card components with Skeleton children
    const skeletons = document.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows error state when API returns 500', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json(
          { error: 'Internal server error', message: 'Server crashed' },
          { status: 500 },
        )
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load changes')).toBeInTheDocument()
    })
  })

  it('shows error state when API returns 409 (merge conflict)', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json(
          { error: 'Conflict', message: 'Merge conflict detected' },
          { status: 409 },
        )
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load changes')).toBeInTheDocument()
    })

    // The error message from the API should be rendered
    expect(screen.getByText(/Merge conflict detected|Conflict/)).toBeInTheDocument()
  })

  it('shows empty state when files array is empty', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json({
          files: [],
          diff: '',
        })
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    await waitFor(() => {
      expect(screen.getByText('No changes found')).toBeInTheDocument()
    })

    expect(
      screen.getByText('This task has not made any code changes yet.'),
    ).toBeInTheDocument()
  })

  it('renders file list and stats on success with multiple files', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json(mockChangesWithSummary)
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    // Wait for data to load and render
    await waitFor(() => {
      expect(screen.getByText('Changed Files')).toBeInTheDocument()
    })

    // File list sidebar should show file count
    expect(screen.getByText('3 files')).toBeInTheDocument()

    // File names should appear in the sidebar
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
    expect(screen.getByText('old.ts')).toBeInTheDocument()

    // DiffStats should render the summary values
    // The stats show additions and deletions from the summary
    expect(screen.getByText('35')).toBeInTheDocument() // totalAdditions
    expect(screen.getByText('18')).toBeInTheDocument() // totalDeletions
    expect(screen.getByText('3 files changed')).toBeInTheDocument()
  })

  it('auto-selects first file when none is selected', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json(mockChangesWithSummary)
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    // Wait for the diff viewer to show the first file's path in the toolbar
    await waitFor(() => {
      // The DiffViewer toolbar shows the selected file path
      expect(screen.getByText('src/index.ts')).toBeInTheDocument()
    })

    // The diff viewer mock should render content for the first file
    expect(screen.getByTestId('diff-viewer')).toBeInTheDocument()
    expect(screen.getByTestId('diff-viewer')).toHaveTextContent('diff content')
  })

  it('computes summary from files when summary is not provided by API', async () => {
    server.use(
      http.get('*/api/tasks/:id/changes', () => {
        return HttpResponse.json(mockChangesWithoutSummary)
      }),
    )

    renderWithProviders(<TaskDiff taskId={TASK_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Changed Files')).toBeInTheDocument()
    })

    // Computed summary: totalAdditions = 5 + 8 = 13, totalDeletions = 2 + 0 = 2, filesChanged = 2
    expect(screen.getByText('13')).toBeInTheDocument() // computed totalAdditions
    expect(screen.getByText('2 files changed')).toBeInTheDocument() // computed filesChanged

    // The deletions value (2) should be present in the stats
    // DiffStats renders deletions in a span with red color
    const deletionElements = document.querySelectorAll(
      '[class*="text-red"]',
    )
    const deletionTexts = Array.from(deletionElements).map(
      (el) => el.textContent,
    )
    expect(deletionTexts).toContain('2')
  })
})
