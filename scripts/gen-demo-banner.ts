import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

async function main() {
  const zai = await ZAI.create()
  const response = await zai.images.generations.create({
    prompt:
      'Cinematic wide banner photograph of a high school robotics club workshop at night, dark moody atmosphere with deep teal-green ambient lighting, student silhouettes working on a large competition robot, scattered tools and circuit boards in soft-focus foreground, dramatic rim light on a robotic arm, subtle emerald green glow accents, professional photography, shallow depth of field, dark tones, ideal for a website header with white text overlay, high quality, detailed',
    size: '1536x768',
  })
  const base64 = response.data[0].base64
  fs.writeFileSync('/home/z/my-project/public/banners/robotics-banner.png', Buffer.from(base64, 'base64'))
  console.log('saved', Buffer.from(base64, 'base64').length, 'bytes')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
