import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl font-extrabold text-club mb-2">404</div>
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-club text-club-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
