// Targeted second pass: resize each image to the maximum size it can ever
// be DISPLAYED at (2x retina headroom included), then recompress.
// Display sizes audited from landing-page.tsx / admin-tour.tsx /
// onboarding-tour.tsx:
//   marquee cards   h-36..h-44 (144-176px tall)  -> 640w max useful
//   step cards      h-36 (~380px wide col)       -> 800w max useful
//   polaroids       ~46-52% of max-w-6xl          -> 900w max useful
//   hero            full-bleed, opacity-60 blend -> keep 1024w, lower q
//   collage main    ~86% of max-w-6xl             -> keep 1182w
//   tour modals     ~560px wide                   -> keep 768-900w
const sharp = require("sharp")
const fs = require("fs")

const PLAN = {
  // marquee-only banners (1400x700 rendered at <=246px wide!)
  "public/banners/photography-banner.jpg": { w: 640, q: 74 },
  "public/banners/debate-banner.jpg": { w: 640, q: 74 },
  // hero (blended at opacity 60 — compression artifacts invisible)
  "public/landing/bn-gym-north.jpg": { q: 70 },
  // collage main card — keep dims, squeeze quality
  "public/landing/bn-team-photo.jpg": { q: 72 },
  // polaroids
  "public/landing/real-robotics.jpg": { w: 900, q: 74 },
  "public/landing/real-friends.jpg": { q: 74 },
  // step-card headers (h-36)
  "public/landing/bn-classroom-demo.jpg": { w: 800, q: 74 },
  "public/landing/bn-club-fair.jpg": { w: 640, q: 74 },
  "public/landing/bn-signup-table.jpg": { w: 640, q: 74 },
  "public/landing/bn-welcome-meeting.jpg": { w: 640, q: 74 },
  // tours / big cards
  "public/landing/tour-welcome.jpg": { q: 74 },
  "public/landing/bn-atrium.jpg": { q: 74 },
  // marquee 640w images — already right-sized, gentle squeeze only
  "public/landing/real-campus.jpg": { q: 74 },
  "public/landing/real-study.jpg": { q: 74 },
  "public/landing/real-photography.jpg": { q: 74 },
  "public/landing/real-debate.jpg": { q: 74 },
  "public/landing/real-volunteer.jpg": { q: 74 },
  "public/landing/real-debate-hoodie.jpg": { q: 74 },
  "public/landing/bn-cake-decorating.jpg": { q: 74 },
  "public/landing/bn-theater-fundraiser.jpg": { q: 74 },
  "public/landing/bn-snack-social.jpg": { q: 74 },
  "public/landing/bn-study-hangout.jpg": { q: 74 },
  "public/landing/bn-lobby.jpg": { q: 74 },
}

;(async () => {
  let before = 0
  let after = 0
  for (const [p, { w, q }] of Object.entries(PLAN)) {
    const orig = fs.statSync(p).size
    before += orig
    let pipeline = sharp(p, { failOn: "none" }).rotate()
    if (w) pipeline = pipeline.resize({ width: w, withoutEnlargement: true })
    const out = await pipeline.jpeg({ quality: q, progressive: true, mozjpeg: true }).toBuffer()
    if (out.length < orig * 0.85) {
      fs.writeFileSync(p, out)
      after += out.length
      console.log(`${Math.round(orig / 1024)}KB -> ${Math.round(out.length / 1024)}KB  ${p}`)
    } else {
      after += orig
      console.log(`${Math.round(orig / 1024)}KB  keep  ${p}`)
    }
  }
  console.log(`\nTHIS PASS: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
