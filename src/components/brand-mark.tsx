import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * ClubHub brand mark — the custom club logo rendered as white on a rounded
 * square background in the club accent color.
 *
 * The logo image (`/club-logo-white.png`) is a white silhouette on a
 * transparent background. We render it inside a rounded-square container
 * with `bg-club` so the logo adapts to each club's accent color.
 */
export function BrandMark({
  className,
  size = 32,
}: {
  className?: string
  size?: number
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0 rounded-lg bg-club overflow-hidden",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/club-logo.png"
        alt="ClubHub"
        width={size}
        height={size}
        className="object-contain p-[15%]"
        priority
        unoptimized
      />
    </div>
  )
}
