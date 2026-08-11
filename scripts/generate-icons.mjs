// Generates PWA PNG icons with no external dependencies.
// Renders a gradient rounded-square "shield + check" and encodes PNG via zlib.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

// ---- tiny PNG encoder (truecolor + alpha) ----
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- vector helpers ----
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (edge, x) => clamp01(0.5 - (x - edge)) // 1px AA band

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4)
  const pad = maskable ? size * 0.14 : size * 0.06 // safe area for maskable
  const s = size - pad * 2
  const radius = maskable ? size * 0.5 : s * 0.24 // maskable ~circle-safe, else rounded square
  const cx = size / 2
  const cy = size / 2

  // shield geometry (relative to inner square)
  const sx = pad
  const sy = pad
  const topY = sy + s * 0.14
  const midX = sx + s * 0.5
  const shieldStroke = s * 0.05

  // checkmark points
  const c1 = [sx + s * 0.36, sy + s * 0.52]
  const c2 = [sx + s * 0.47, sy + s * 0.63]
  const c3 = [sx + s * 0.66, sy + s * 0.40]
  const checkStroke = s * 0.055

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // rounded-square / circle mask (distance to rounded rect)
      const qx = Math.max(Math.abs(x - cx) - (s / 2 - radius), 0)
      const qy = Math.max(Math.abs(y - cy) - (s / 2 - radius), 0)
      const dRect = Math.hypot(qx, qy) - radius
      const bgAlpha = smooth(0, dRect)
      if (bgAlpha <= 0) {
        rgba[i + 3] = 0
        continue
      }
      // gradient indigo -> violet
      const t = clamp01((x + y) / (2 * size))
      let r = lerp(0x63, 0x8b, t)
      let g = lerp(0x66, 0x5c, t)
      let b = lerp(0xf1, 0xf6, t)

      // shield outline (approx path with segments) — draw as white ring
      const shieldD = Math.min(
        distSeg(x, y, midX, topY, sx + s * 0.2, sy + s * 0.26),
        distSeg(x, y, sx + s * 0.2, sy + s * 0.26, sx + s * 0.2, sy + s * 0.5),
        distSeg(x, y, sx + s * 0.2, sy + s * 0.5, midX, sy + s * 0.82),
        distSeg(x, y, midX, topY, sx + s * 0.8, sy + s * 0.26),
        distSeg(x, y, sx + s * 0.8, sy + s * 0.26, sx + s * 0.8, sy + s * 0.5),
        distSeg(x, y, sx + s * 0.8, sy + s * 0.5, midX, sy + s * 0.82),
      )
      const shieldA = smooth(shieldStroke, shieldD)

      // checkmark
      const checkD = Math.min(
        distSeg(x, y, c1[0], c1[1], c2[0], c2[1]),
        distSeg(x, y, c2[0], c2[1], c3[0], c3[1]),
      )
      const checkA = smooth(checkStroke, checkD)

      const white = Math.max(shieldA, checkA)
      r = lerp(r, 255, white)
      g = lerp(g, 255, white)
      b = lerp(b, 255, white)

      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = Math.round(bgAlpha * 255)
    }
  }
  return encodePNG(size, size, rgba)
}

writeFileSync(join(OUT, 'icon-192.png'), render(192, false))
writeFileSync(join(OUT, 'icon-512.png'), render(512, false))
writeFileSync(join(OUT, 'icon-512-maskable.png'), render(512, true))
console.log('Icons written to public/icons/')
