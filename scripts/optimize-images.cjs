// One-off image optimizer for public/ assets.
// - JPEG: mozjpeg + progressive + adaptive quality; downscale anything wider
//   than 1280px (nothing renders larger than ~1200 CSS px in this app).
// - PNG icons: palette quantization (icons have few colors; huge win).
// - Only overwrites when the result is meaningfully smaller (>20% win).
// - Never touches favicon.ico / tour-avatar.jpg (already tiny).
const sharp = require("sharp")
const fs = require("fs")
const path = require("path")

const SKIP = new Set(["favicon.ico", "tour-avatar.jpg"])
const MAX_W = 1280

async function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const s = fs.statSync(p)
    if (s.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

;(async () => {
  const files = (await walk("public")).filter(
    (p) => !SKIP.has(path.basename(p)) && /\.(jpe?g|png)$/i.test(p),
  )
  let totalBefore = 0
  let totalAfter = 0
  for (const p of files) {
    const before = fs.statSync(p).size
    totalBefore += before
    const buf = fs.readFileSync(p)
    const isPng = /\.png$/i.test(p)
    const img = sharp(buf, { failOn: "none" })
    const meta = await img.metadata()
    let out
    if (isPng) {
      // Palette PNG: icons/logos render identically at a fraction of the size.
      out = await img.png({ quality: 90, palette: true, compressionLevel: 9, effort: 9 }).toBuffer()
    } else {
      const needsResize = meta.width > MAX_W
      const quality = before > 120_000 ? 72 : before > 65_000 ? 75 : 78
      let pipeline = img.rotate() // respects EXIF before resizing
      if (needsResize) pipeline = pipeline.resize({ width: MAX_W, withoutEnlargement: true })
      out = await pipeline
        .jpeg({ quality, progressive: true, mozjpeg: true, chromaSubsampling: "4:2:0" })
        .toBuffer()
    }
    // Accept the rewrite only on a decisive win — protects already-optimal files.
    if (out.length < before * 0.8) {
      fs.writeFileSync(p, out)
      totalAfter += out.length
      console.log(
        `${Math.round(before / 1024)}KB -> ${Math.round(out.length / 1024)}KB  ${p}${isPng ? "" : ` (q${before > 120_000 ? 72 : before > 65_000 ? 75 : 78})`}`,
      )
    } else {
      totalAfter += before
      console.log(`${Math.round(before / 1024)}KB  keep  ${p} (win < 20%)`)
    }
  }
  console.log(`\nTOTAL: ${(totalBefore / 1024).toFixed(0)}KB -> ${(totalAfter / 1024).toFixed(0)}KB (${((1 - totalAfter / totalBefore) * 100).toFixed(0)}% saved)`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
