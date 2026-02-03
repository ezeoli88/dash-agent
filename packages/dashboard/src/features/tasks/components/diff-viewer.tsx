'use client'

import { useState, useMemo } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { useTheme } from 'next-themes'
import { Copy, Check, SplitSquareVertical, AlignJustify } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FileChange } from '../types'

interface DiffViewerProps {
  file: FileChange | null
  className?: string
}

// Custom styles for the diff viewer
const lightStyles = {
  variables: {
    light: {
      diffViewerBackground: '#ffffff',
      diffViewerColor: '#212529',
      addedBackground: '#e6ffec',
      addedColor: '#24292e',
      removedBackground: '#ffebe9',
      removedColor: '#24292e',
      wordAddedBackground: '#acf2bd',
      wordRemovedBackground: '#fdb8c0',
      addedGutterBackground: '#cdffd8',
      removedGutterBackground: '#ffdce0',
      gutterBackground: '#f6f8fa',
      gutterBackgroundDark: '#f0f1f2',
      highlightBackground: '#fffbdd',
      highlightGutterBackground: '#fff5b1',
      codeFoldGutterBackground: '#dbedff',
      codeFoldBackground: '#f1f8ff',
      emptyLineBackground: '#fafbfc',
      gutterColor: '#6e7781',
      addedGutterColor: '#22863a',
      removedGutterColor: '#cb2431',
      codeFoldContentColor: '#0969da',
      diffViewerTitleBackground: '#f6f8fa',
      diffViewerTitleColor: '#24292e',
      diffViewerTitleBorderColor: '#d0d7de',
    },
  },
  line: {
    padding: '2px 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '13px',
  },
  gutter: {
    minWidth: '40px',
    padding: '0 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '12px',
  },
  contentText: {
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '13px',
  },
}

const darkStyles = {
  variables: {
    dark: {
      diffViewerBackground: '#0d1117',
      diffViewerColor: '#c9d1d9',
      addedBackground: '#1a4721',
      addedColor: '#aff5b4',
      removedBackground: '#5c1a1a',
      removedColor: '#ffa198',
      wordAddedBackground: '#2ea043',
      wordRemovedBackground: '#da3633',
      addedGutterBackground: '#244e2a',
      removedGutterBackground: '#632c2c',
      gutterBackground: '#161b22',
      gutterBackgroundDark: '#21262d',
      highlightBackground: '#3b2e00',
      highlightGutterBackground: '#4b3d00',
      codeFoldGutterBackground: '#1f2937',
      codeFoldBackground: '#1f2937',
      emptyLineBackground: '#161b22',
      gutterColor: '#8b949e',
      addedGutterColor: '#7ee787',
      removedGutterColor: '#ffa198',
      codeFoldContentColor: '#58a6ff',
      diffViewerTitleBackground: '#161b22',
      diffViewerTitleColor: '#c9d1d9',
      diffViewerTitleBorderColor: '#30363d',
    },
  },
  line: {
    padding: '2px 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '13px',
  },
  gutter: {
    minWidth: '40px',
    padding: '0 8px',
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '12px',
  },
  contentText: {
    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
    fontSize: '13px',
  },
}

export function DiffViewer({ file, className }: DiffViewerProps) {
  const { resolvedTheme } = useTheme()
  const [splitView, setSplitView] = useState(true)
  const [copied, setCopied] = useState(false)

  const isDark = resolvedTheme === 'dark'
  const styles = isDark ? darkStyles : lightStyles

  const handleCopy = async () => {
    if (file?.newContent) {
      await navigator.clipboard.writeText(file.newContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Memoize the diff content to prevent unnecessary re-renders
  const diffContent = useMemo(() => {
    if (!file) return null

    return (
      <ReactDiffViewer
        oldValue={file.oldContent || ''}
        newValue={file.newContent || ''}
        splitView={splitView}
        useDarkTheme={isDark}
        styles={styles}
        showDiffOnly={false}
        compareMethod={DiffMethod.WORDS}
        hideLineNumbers={false}
        extraLinesSurroundingDiff={3}
      />
    )
  }, [file, splitView, isDark, styles])

  if (!file) {
    return (
      <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
        <p className="text-sm">Select a file to view changes</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium truncate">{file.path}</span>
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
            {' / '}
            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSplitView(!splitView)}
            title={splitView ? 'Switch to unified view' : 'Switch to split view'}
            className="h-7 px-2"
          >
            {splitView ? (
              <AlignJustify className="size-4" />
            ) : (
              <SplitSquareVertical className="size-4" />
            )}
            <span className="ml-1.5 text-xs">{splitView ? 'Unified' : 'Split'}</span>
          </Button>
          {file.newContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              title="Copy new content"
              className="h-7 px-2"
            >
              {copied ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto">
        {file.status === 'deleted' && !file.oldContent && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">File was deleted (content not available)</p>
          </div>
        )}
        {file.status === 'added' && !file.newContent && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">New file (content not available)</p>
          </div>
        )}
        {((file.oldContent || file.status === 'added') && (file.newContent || file.status === 'deleted')) && (
          diffContent
        )}
      </div>
    </div>
  )
}
