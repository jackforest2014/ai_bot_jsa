import { useEffect, useRef } from 'react'

/** 正八面体顶点与边（中心在原点） */
const OCT_VERTS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

const OCT_EDGES: [number, number][] = [
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

/** 与八面体顶点对应的「立方体角」方向，用于结构 morph */
const OCT_TO_CUBEISH: [number, number, number][] = [
  [1, 0.82, 0.82],
  [-1, 0.82, 0.82],
  [0.82, 1, 0.82],
  [0.82, -1, 0.82],
  [0.82, 0.82, 1],
  [0.82, 0.82, -1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l] as [number, number, number]
})

const CUBE_RAW: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
]

const CUBE_VERTS: [number, number, number][] = CUBE_RAW.map(([x, y, z]) => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l] as [number, number, number]
})

const CUBE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
]

const PARTICLE_COUNT = 96

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  z: number
  vz: number
  r: number
  hue: number
}

function initParticles(w: number, h: number, light: boolean): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    out.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 10,
      z: Math.random(),
      vz: (Math.random() - 0.5) * 0.15,
      r: 0.6 + Math.random() * 1.8,
      hue: light ? 195 + Math.random() * 48 : 175 + Math.random() * 55,
    })
  }
  return out
}

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

function rotateZ(x: number, y: number, z: number, ang: number) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [x * c - y * s, x * s + y * c, z] as const
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

export type LoginCanvasColorScheme = 'light' | 'dark'

/**
 * 登录页动态线框：八面体 ↔ 立方体角向 morph、内外双层、独立立方体壳、Z 轴扭转 + 漂浮粒子。
 * `colorScheme` 与登录页亮色/深色一致，保证线框与粒子在浅色背景上仍清晰可读。
 */
export default function MorphingWireframeCanvas({
  className,
  colorScheme = 'dark',
}: {
  className?: string
  colorScheme?: LoginCanvasColorScheme
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
    let particles: Particle[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const nw = Math.max(rect.width, 1)
      const nh = Math.max(rect.height, 1)
      if (nw !== w || nh !== h) {
        w = nw
        h = nh
        canvas.width = w * dpr
        canvas.height = h * dpr
        particles = initParticles(w, h, light)
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const transformVert = (
      x: number,
      y: number,
      z: number,
      ry: number,
      rx: number,
      rz: number,
    ) => {
      let tx = x
      let ty = y
      let tz = z
      ;[tx, ty, tz] = rotateY(tx, ty, tz, ry)
      ;[tx, ty, tz] = rotateX(tx, ty, tz, rx)
      ;[tx, ty, tz] = rotateZ(tx, ty, tz, rz)
      return [tx, ty, tz] as const
    }

    const frame = (now: number) => {
      const t = (now - t0) / 1000
      resize()
      if (w < 1 || h < 1) {
        raf = requestAnimationFrame(frame)
        return
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const scale = Math.min(w, h) * 0.38
      const ry = t * 0.55
      const rx = t * 0.35
      const rz = t * 0.22 + Math.sin(t * 0.55) * 0.18
      const morphPhase = 0.5 + 0.5 * Math.sin(t * 0.48)
      const breathe = Math.sin(t * 0.85) * 0.22
      const twist = Math.sin(t * 0.62) * 0.12

      const buildOctVerts = (scaleMul: number, ryOff: number, rxOff: number, rzExtra: number) => {
        return OCT_VERTS.map((v, i) => {
          const [ox, oy, oz] = v
          const [tx, ty, tz] = OCT_TO_CUBEISH[i]!
          const bx = ox * (1 - morphPhase) + tx * morphPhase
          const by = oy * (1 - morphPhase) + ty * morphPhase
          const bz = oz * (1 - morphPhase) + tz * morphPhase
          const l = Math.hypot(bx, by, bz) || 1
          let nx = (bx / l) * scaleMul * (1 + breathe * Math.sin(t * 1.1 + i * 0.9))
          let ny = (by / l) * scaleMul * (1 + breathe * Math.cos(t * 0.95 + i * 0.7))
          let nz = (bz / l) * scaleMul * (1 + breathe * Math.sin(t * 1.05 + i * 1.1))
          nx *= 1 + twist * Math.sin(t * 0.8 + oy)
          ny *= 1 + twist * Math.cos(t * 0.75 + ox)
          nz *= 1 + twist * Math.sin(t * 0.9 + oz)
          return transformVert(nx, ny, nz, ry + ryOff, rx + rxOff, rz + rzExtra)
        })
      }

      const vertsMain = buildOctVerts(1, 0, 0, 0).map(([x, y, z]) => project(x, y, z, cx, cy, scale))
      const vertsInner = buildOctVerts(0.44, 1.15, -0.9, -0.4).map(([x, y, z]) =>
        project(x, y, z, cx, cy, scale),
      )

      const cubeVerts = CUBE_VERTS.map(([vx, vy, vz], i) => {
        const wob = 1 + 0.1 * Math.sin(t * 1.15 + i * 0.85)
        const [x, y, z] = transformVert(vx * wob * 0.78, vy * wob * 0.78, vz * wob * 0.78, ry * -0.65, rx * 0.5, rz * -0.55)
        return project(x, y, z, cx, cy, scale)
      })

      const drift = Math.sin(t * 0.31) * 0.5
      for (const p of particles) {
        p.x += p.vx * 0.016 + drift
        p.y += p.vy * 0.016 + Math.cos(t * 0.42 + p.hue) * 0.12
        p.z += p.vz * 0.008
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20
        if (p.z < 0 || p.z > 1) p.vz *= -1
        const tw = 0.35 + 0.4 * Math.sin(t * 2.1 + p.hue * 0.05)
        const alpha = light
          ? 0.1 + p.z * 0.22 + tw * 0.12
          : 0.22 + p.z * 0.38 + tw * 0.22
        const pr = p.r * (0.85 + 0.3 * p.z)
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr * 4)
        if (light) {
          g.addColorStop(0, `hsla(${p.hue}, 78%, 36%, ${alpha})`)
          g.addColorStop(0.35, `hsla(${p.hue + 12}, 70%, 48%, ${alpha * 0.5})`)
        } else {
          g.addColorStop(0, `hsla(${p.hue}, 95%, 78%, ${alpha})`)
          g.addColorStop(0.35, `hsla(${p.hue + 18}, 88%, 62%, ${alpha * 0.55})`)
        }
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, pr * 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.save()
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'
      const streamN = 12
      for (let i = 0; i < streamN; i++) {
        const phase = t * 0.4 + i * 1.7
        const x0 = ((Math.sin(phase * 0.7) * 0.5 + 0.5) * w) | 0
        const y0 = ((i / streamN) * h * 1.2 - h * 0.08 + Math.sin(phase) * 40) | 0
        const len = 28 + (i % 5) * 14
        const a = light ? 0.1 + 0.08 * Math.sin(phase * 2) : 0.14 + 0.1 * Math.sin(phase * 2)
        ctx.strokeStyle = light ? `rgba(2, 132, 199, ${a})` : `rgba(165, 243, 252, ${a})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + len, y0 + len * 0.35)
        ctx.stroke()
      }
      ctx.restore()

      const drawEdges = (
        verts: [number, number][],
        edges: [number, number][],
        stroke: string,
        lw: number,
        glow: string,
        blur: number,
      ) => {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lw
        ctx.shadowColor = glow
        ctx.shadowBlur = blur
        for (const [a, b] of edges) {
          const [x1, y1] = verts[a]!
          const [x2, y2] = verts[b]!
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
        ctx.shadowBlur = 0
      }

      const pulse = 0.45 + 0.25 * Math.sin(t * 1.6)
      if (light) {
        drawEdges(
          vertsInner,
          OCT_EDGES,
          `rgba(91, 33, 182, ${0.28 + pulse * 0.22})`,
          0.95,
          'rgba(91, 33, 182, 0.2)',
          4,
        )
        drawEdges(
          cubeVerts,
          CUBE_EDGES,
          `rgba(2, 132, 199, ${0.38 + pulse * 0.2})`,
          1.05,
          'rgba(14, 165, 233, 0.25)',
          5,
        )
        drawEdges(
          vertsMain,
          OCT_EDGES,
          `rgba(3, 105, 161, ${0.42 + pulse * 0.28})`,
          1.35,
          'rgba(2, 132, 199, 0.3)',
          6,
        )
      } else {
        drawEdges(
          vertsInner,
          OCT_EDGES,
          `rgba(167, 139, 250, ${0.2 + pulse * 0.2})`,
          0.9,
          'rgba(167, 139, 250, 0.35)',
          8,
        )
        drawEdges(
          cubeVerts,
          CUBE_EDGES,
          `rgba(125, 211, 252, ${0.22 + pulse * 0.18})`,
          1,
          'rgba(56, 189, 248, 0.4)',
          9,
        )
        drawEdges(
          vertsMain,
          OCT_EDGES,
          `rgba(56, 189, 248, ${0.48 + pulse * 0.38})`,
          1.35,
          'rgba(34, 211, 238, 0.55)',
          12,
        )
      }

      ctx.save()
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'
      for (let i = 0; i < vertsMain.length; i++) {
        const [vx, vy] = vertsMain[i]!
        const b = 0.52 + 0.28 * Math.sin(t * 2.4 + i)
        ctx.fillStyle = light
          ? `rgba(13, 148, 136, ${0.35 + b * 0.35})`
          : `rgba(224, 250, 255, ${b})`
        ctx.beginPath()
        ctx.arc(vx, vy, 2.4 + 1 * Math.sin(t * 3 + i), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [colorScheme])

  return <canvas ref={ref} className={className} aria-hidden />
}
