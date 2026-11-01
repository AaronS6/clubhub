// Usability probe: run in agent-browser eval on the ClubHub app.
// Finds horizontal overflow, small tap targets, and clipped headings.
(() => {
  const vw = document.documentElement.clientWidth
  const issues = { overflow: [], smallTargets: [], clipped: [] }

  // 1. Horizontal overflow — any element extending past the viewport.
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
      const cs = getComputedStyle(el)
      if (cs.position === "fixed" || cs.position === "absolute") return
      // skip inside horizontally-scrollable strips (intended)
      let p = el.parentElement, scrollable = false
      while (p && p !== document.body) {
        const pcs = getComputedStyle(p)
        if ((pcs.overflowX === "auto" || pcs.overflowX === "scroll")) { scrollable = true; break }
        p = p.parentElement
      }
      if (!scrollable) {
        issues.overflow.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 60),
          right: Math.round(r.right),
          left: Math.round(r.left),
          text: (el.textContent || "").trim().slice(0, 30),
        })
      }
    }
  })
  issues.overflow = issues.overflow.slice(0, 8)

  // 2. Small tap targets on touch: interactive elements under 36px tall.
  document.querySelectorAll("button, a[href], [role=menuitem], input, textarea, select").forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    if (r.height < 36 || r.width < 36) {
      // Icon-only buttons are fine if they have padding+aria-label; flag anyway w/ info
      issues.smallTargets.push({
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20),
        h: Math.round(r.height),
        w: Math.round(r.width),
      })
    }
  })
  issues.smallTargets = issues.smallTargets.slice(0, 10)

  // 3. Clipped headings (ellipsized h1/h2 hiding content).
  document.querySelectorAll("h1, h2, h3").forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 2) {
      issues.clipped.push({ text: el.textContent.trim().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth })
    }
  })

  return JSON.stringify({ vw, overflowCount: issues.overflow.length, ...issues }, null, 1)
})()
