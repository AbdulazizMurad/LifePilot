// Generates PWA PNG icons with no external dependencies.
// Renders the gradient rounded-square "LP" monogram and encodes PNG via zlib.
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

/**
 * "LP" monogram as stroked segments in normalised (0..1) space.
 * The P bowl is an arc approximated by short segments.
 */
function monogramSegments(sx, sy, s) {
  const px = (u) => sx + s * u
  const py = (v) => sy + s * v
  const segs = [
    // L: stem then foot
    [px(0.27), py(0.28), px(0.27), py(0.72)],
    [px(0.27), py(0.72), px(0.41), py(0.72)],
    // P: stem, then top bar into the bowl
    [px(0.55), py(0.72), px(0.55), py(0.28)],
    [px(0.55), py(0.28), px(0.625), py(0.28)],
    [px(0.625), py(0.50), px(0.55), py(0.50)],
  ]
  // P bowl: half circle from the top bar round to the waist
  const bcx = px(0.625)
  const bcy = py(0.39)
  const br = s * 0.11
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * i) / steps
    const a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / steps
    segs.push([bcx + br * Math.cos(a0), bcy + br * Math.sin(a0), bcx + br * Math.cos(a1), bcy + br * Math.sin(a1)])
  }
  return segs
}

function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4)
  // Maskable icons are full-bleed — the launcher applies its own mask — so the
  // artwork keeps clear of the outer ~20% safe zone instead of being rounded here.
  const bgPad = maskable ? 0 : size * 0.06
  const bgSize = size - bgPad * 2
  const radius = maskable ? 0 : bgSize * 0.24
  const contentPad = maskable ? size * 0.22 : bgPad
  const contentSize = size - contentPad * 2
  const cx = size / 2
  const cy = size / 2

  const segs = monogramSegments(contentPad, contentPad, contentSize)
  const stroke = contentSize * 0.055

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let bgAlpha = 1
      if (!maskable) {
        // rounded-square mask (signed distance to a rounded rect)
        const qx = Math.max(Math.abs(x - cx) - (bgSize / 2 - radius), 0)
        const qy = Math.max(Math.abs(y - cy) - (bgSize / 2 - radius), 0)
        bgAlpha = smooth(0, Math.hypot(qx, qy) - radius)
      }
      if (bgAlpha <= 0) {
        rgba[i + 3] = 0
        continue
      }
      // gradient indigo -> violet
      const t = clamp01((x + y) / (2 * size))
      let r = lerp(0x63, 0x8b, t)
      let g = lerp(0x66, 0x5c, t)
      let b = lerp(0xf1, 0xf6, t)

      // distance to the nearest monogram stroke
      let d = Infinity
      for (const [ax, ay, bx, by] of segs) {
        const dd = distSeg(x, y, ax, ay, bx, by)
        if (dd < d) d = dd
      }
      const white = smooth(stroke, d)
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
