import { useEffect, useRef } from 'react'

/** 正八面体顶点与边（中心在原点） */
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

/**
 * 登录页动态线框体：旋转 + 顶点径向呼吸，纯 Canvas 无 three.js。
 */
export default function MorphingWireframeCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    let w = 0
    let h = 0
    let raf = 0
    const t0 = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = Math.max(rect.width, 1)
      h = Math.max(rect.height, 1)
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const rotateY = (x: number, y: number, z: number, ang: number) => {
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      return [x * c + z * s, y, -x * s + z * c] as const
    }

    const rotateX = (x: number, y: number, z: number, ang: number) => {
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      return [x, y * c - z * s, y * s + z * c] as const
    }

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      resize()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const scale = Math.min(w, h) * 0.38
      const ry = t * 0.55
      const rx = t * 0.35
      const morph = Math.sin(t * 0.85) * 0.22

      const verts = VERTS.map((v, i) => {
        const s = 1 + morph * Math.sin(t * 1.1 + i * 0.9)
        let [x, y, z] = [v[0] * s, v[1] * s, v[2] * s]
        ;[x, y, z] = rotateY(x, y, z, ry)
        ;[x, y, z] = rotateX(x, y, z, rx)
        const persp = 2.8 / (2.8 + z)
        return [cx + x * scale * persp, cy - y * scale * persp] as const
      })

      const pulse = 0.45 + 0.25 * Math.sin(t * 1.6)
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.35 + pulse * 0.35})`
      ctx.lineWidth = 1.25
      ctx.shadowColor = 'rgba(34, 211, 238, 0.45)'
      ctx.shadowBlur = 10

      for (const [a, b] of EDGES) {
        const [x1, y1] = verts[a]!
        const [x2, y2] = verts[b]!
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      ctx.shadowBlur = 0
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
    />
  )
}
