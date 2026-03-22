import { useEffect, useRef } from 'react'

/** 与登录页 MorphingWireframeCanvas 同源：正八面体线框，仅旋转、无粒子 */
const VERTS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

const EDGES: [number, number][] = [
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 4],
  [2, 5],
  [3, 4],
  [3, 5],
]

function rotateY(x: number, y: number, z: number, ang: number) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [x * c + z * s, y, -x * s + z * c] as const
}

function rotateX(x: number, y: number, z: number, ang: number) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [x, y * c - z * s, y * s + z * c] as const
}

function project(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  scale: number,
): [number, number] {
  const persp = 2.8 / (2.8 + z)
  return [cx + x * scale * persp, cy - y * scale * persp]
}

export type HeaderBrandGlyphScheme = 'light' | 'dark'

export default function HeaderBrandGlyph({
  colorScheme,
  className,
}: {
  colorScheme: HeaderBrandGlyphScheme
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const light = colorScheme === 'light'
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    let w = 0
    let h = 0
    let raf = 0
    const t0 = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const nw = Math.max(rect.width, 1)
      const nh = Math.max(rect.height, 1)
      if (nw !== w || nh !== h) {
        w = nw
        h = nh
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      resize()
      if (w < 1 || h < 1) {
        raf = requestAnimationFrame(frame)
        return
      }

      const ry = t * 0.65
      const rx = t * 0.38
      const cx = w / 2
      const cy = h / 2
      const scale = Math.min(w, h) * 0.36

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = light ? 'rgba(8, 120, 150, 0.88)' : 'rgba(103, 232, 249, 0.92)'
      ctx.lineWidth = light ? 1.35 : 1.2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const projVerts: [number, number][] = []
      for (const [vx, vy, vz] of VERTS) {
        let x = vx * 0.92
        let y = vy * 0.92
        let z = vz * 0.92
        ;[x, y, z] = rotateY(x, y, z, ry)
        ;[x, y, z] = rotateX(x, y, z, rx)
        projVerts.push(project(x, y, z, cx, cy, scale))
      }

      ctx.beginPath()
      for (const [a, b] of EDGES) {
        const [x0, y0] = projVerts[a]!
        const [x1, y1] = projVerts[b]!
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [colorScheme])

  return (
    <canvas
      ref={ref}
      className={className}
      width={36}
      height={36}
      aria-hidden
    />
  )
}
