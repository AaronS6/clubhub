/**
 * scripts/remove-logo-bg.ts
 *
 * Removes the (near-)white background from `public/club-logo.png` and writes
 * the result back to the same path with a true alpha channel.
 *
 * Algorithm:
 *   1. Load the logo with sharp, normalize to a flat 4-channel RGBA buffer.
 *   2. Walk every pixel. If R, G, AND B are all strictly greater than 230
 *      (i.e. near-white), set the alpha byte to 0 — fully transparent. All
 *      other pixels keep their original RGB and full opacity.
 *   3. Re-wrap the mutated buffer in a sharp pipeline, force PNG output with
 *      alpha, and overwrite the source file.
 *
 * Run with: `bun run scripts/remove-logo-bg.ts`
 *
 * Notes:
 *   - The threshold (230) is intentionally just-below pure white so slightly
 *     off-white JPEG artifacts around the logo edge are also removed, giving
 *     a clean halo-free cutout. Anything darker than 230 is preserved as-is,
 *     so the logo's original colors are untouched.
 *   - sharp is already a project dependency (used for avatar/logo upload
 *     processing in the API), so no install step is needed.
 *   - The source file is actually a baseline JPEG that was renamed to .png.
 *     sharp handles this transparently — it sniffs the real codec from the
 *     buffer, not the extension. The output is always real PNG with alpha.
 */

import sharp from "sharp"
import { resolve } from "node:path"

const LOGO_PATH = resolve(process.cwd(), "public/club-logo.png")

const NEAR_WHITE_THRESHOLD = 230
const ALPHA_TRANSPARENT = 0
const ALPHA_OPAQUE = 255

async function main() {
  console.log(`Loading:  ${LOGO_PATH}`)

  // Normalize to RGBA8 (4 bytes/pixel) so we can mutate alpha bytes directly.
  const { data, info } = await sharp(LOGO_PATH)
    // ensureAlpha guarantees 4 channels regardless of the input codec.
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  if (channels !== 4) {
    throw new Error(
      `Expected 4 channels after ensureAlpha(), got ${channels}. Refusing to mutate an unknown layout.`
    )
    // (Unreachable — sharp's ensureAlpha always yields 4 channels. Kept as a
    // safety net so a future sharp behavior change can't silently corrupt the
    // file.)
  }

  let transparentCount = 0
  const totalPixels = width * height

  // Pixel layout in raw RGBA8: [R, G, B, A, R, G, B, A, ...].
  // Step by 4 bytes per pixel; the alpha byte is at offset +3.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    if (r > NEAR_WHITE_THRESHOLD && g > NEAR_WHITE_THRESHOLD && b > NEAR_WHITE_THRESHOLD) {
      data[i + 3] = ALPHA_TRANSPARENT
      transparentCount++
    } else {
      // Preserve original RGB; guarantee full opacity for any pixel that
      // wasn't already flagged transparent above.
      data[i + 3] = ALPHA_OPAQUE
    }
  }

  const keptPct = ((totalPixels - transparentCount) / totalPixels) * 100
  console.log(
    `Processed: ${width}x${height} (${totalPixels.toLocaleString()} px). ` +
      `Made ${transparentCount.toLocaleString()} px transparent ` +
      `(${((transparentCount / totalPixels) * 100).toFixed(1)}%), ` +
      `kept ${keptPct.toFixed(1)}% of pixels.`
  )

  // Re-wrap the mutated buffer and write back as a true PNG with alpha.
  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(LOGO_PATH)

  console.log(`Saved:    ${LOGO_PATH} (PNG with alpha channel)`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to remove logo background:", err)
    process.exit(1)
  })
