import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 [a&]:hover:bg-blue-200 dark:[a&]:hover:bg-blue-800",
        secondary:
          "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 [a&]:hover:bg-gray-200 dark:[a&]:hover:bg-gray-700",
        destructive:
          "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 [a&]:hover:bg-red-200 dark:[a&]:hover:bg-red-800",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        warning:
          "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 [a&]:hover:bg-amber-200 dark:[a&]:hover:bg-amber-800",
        success:
          "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 [a&]:hover:bg-green-200 dark:[a&]:hover:bg-green-800",
        purple:
          "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 [a&]:hover:bg-purple-200 dark:[a&]:hover:bg-purple-800",
        indigo:
          "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 [a&]:hover:bg-indigo-200 dark:[a&]:hover:bg-indigo-800",
        orange:
          "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 [a&]:hover:bg-orange-200 dark:[a&]:hover:bg-orange-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
