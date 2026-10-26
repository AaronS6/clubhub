import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/80 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-[inset_0_1px_1px_rgba(15,18,22,0.02)] transition-[color,background-color,border-color,box-shadow] outline-none hover:border-input/80 focus-visible:border-ring/60 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent),inset_0_1px_1px_rgba(15,18,22,0.02)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:shadow-[inset_0_1px_1px_rgba(0,0,0,0.20)] dark:hover:border-input/70 dark:focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_22%,transparent),inset_0_1px_1px_rgba(0,0,0,0.20)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
