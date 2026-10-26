import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,transform,translate,scale,rotate,box-shadow,filter] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // "Physical" primary — a cylindrical body: vertical light gradient
        // painted over the accent, 1px inner highlight, and a colored ambient
        // glow that reads as the button's own light. Hover brightens + the
        // glow deepens; active presses into the body (scale + inset shade).
        // Press feedback (active:scale-[0.98]) lives in the shared base
        // classes above so every variant gets it; the arbitrary transition
        // list keeps the same default 150ms timing the old `transition-colors`
        // had, just widened with transform/box-shadow/filter so the press and
        // glow ease instead of snapping. Color transitions keep their original
        // durations.
        default:
          "text-primary-foreground bg-primary bg-[image:linear-gradient(to_bottom,rgba(255,255,255,0.18),rgba(0,0,0,0.08))] shadow-button hover:shadow-button-hover hover:brightness-[1.04] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)]",
        club:
          "text-club-foreground bg-club bg-[image:linear-gradient(to_bottom,rgba(255,255,255,0.18),rgba(0,0,0,0.08))] shadow-button hover:shadow-button-hover hover:brightness-[1.04] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)]",
        destructive:
          "text-white bg-destructive bg-[image:linear-gradient(to_bottom,rgba(255,255,255,0.16),rgba(0,0,0,0.10))] shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_1px_2px_rgba(15,18,22,0.16),0_2px_10px_rgba(194,54,46,0.30)] hover:brightness-[1.02] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)] dark:bg-destructive/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.40)]",
        outline:
          "border border-input bg-card text-foreground shadow-card hover:bg-accent/60 hover:border-border hover:shadow-card-hover dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,18,22,0.06)] hover:bg-secondary/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-club underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
