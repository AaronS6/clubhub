import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync, writeFileSync } from 'fs'

async function main() {
  const imageBuffer = readFileSync('/home/z/my-project/upload/ChatGPT Image Sep 8, 2026, 06_39_10 PM.png')
  const base64Image = imageBuffer.toString('base64')
  const dataUrl = `data:image/png;base64,${base64Image}`

  const zai = await ZAI.create()
  const response = await zai.images.generations.edit({
    prompt: 'Remove the background completely, make it fully transparent. Keep only the club logo brand mark itself, perfectly centered. Do not add any new background color — the result must have a transparent background. Keep all the original logo details, colors, and design exactly as they are.',
    images: [{ url: dataUrl }],
    size: '1024x1024',
  })

  const imageBase64 = response.data[0].base64
  const buffer = Buffer.from(imageBase64, 'base64')
  writeFileSync('/home/z/my-project/public/club-logo.png', buffer)
  console.log('Saved to public/club-logo.png', buffer.length, 'bytes')
}

main().catch(e => { console.error(e); process.exit(1) })
