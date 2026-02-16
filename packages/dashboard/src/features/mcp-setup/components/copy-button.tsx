import { useState, useCallback } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CopyButtonProps {
  value: string
  className?: string
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
    </Button>
  )
}
