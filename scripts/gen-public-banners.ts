import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const CLUBS = [
  {
    file: '/home/z/my-project/public/banners/photography-banner.jpg',
    prompt:
      'Cinematic wide banner photograph of a high school photography club darkroom, amber and teal safelight glow, film negatives hanging on a line, vintage cameras on a wooden workbench, shallow depth of field, moody dark atmosphere, professional photography, ideal for a website header with white text overlay, high quality, detailed',
  },
  {
    file: '/home/z/my-project/public/banners/debate-banner.jpg',
    prompt:
      'Cinematic wide banner photograph of a school debate team practice room at dusk, wooden podium with a microphone in dramatic side light, empty chairs in soft focus, deep teal and warm amber lighting, quiet anticipation mood, professional photography, shallow depth of field, dark tones, ideal for a website header with white text overlay, high quality, detailed',
  },
]

async function main() {
  const zai = await ZAI.create()
  for (const c of CLUBS) {
    const response = await zai.images.generations.create({
      prompt: c.prompt,
      size: '1536x768',
    })
    const base64 = response.data[0].base64
    fs.writeFileSync(c.file, Buffer.from(base64, 'base64'))
    console.log('saved', c.file, Buffer.from(base64, 'base64').length, 'bytes')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
