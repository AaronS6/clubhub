import Image from "next/image"
import { cn } from "@/lib/utils"

export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <div className={cn("flex items-center justify-center shrink-0 rounded-lg bg-club overflow-hidden", className)}
      style={{ width: size, height: size }}>
      <Image src="/club-logo.png" alt="ClubHub" width={size} height={size}
        className="object-contain p-[15%]" priority unoptimized />
    </div>
  )
}
