"use client"

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-2">⚠️</div>
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-6">
          An unexpected error occurred. Try again, or refresh the page.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-club text-club-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
