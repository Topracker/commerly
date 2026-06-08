'use client'
import { useEffect, useRef } from 'react'

type Particle = { x: number; y: number; vx: number; vy: number; r: number }

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const mouse = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
      active: false,
    }

    const count = Math.min(60, Math.max(24, Math.floor((width * height) / 28000)))
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.5,
    }))

    const onPointerMove = (e: PointerEvent) => {
      mouse.targetX = e.clientX
      mouse.targetY = e.clientY
      mouse.active = true
    }
    const onPointerLeave = () => {
      mouse.active = false
    }

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)

    let rafId = 0
    let lastT = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(50, now - lastT)
      lastT = now

      if (!mouse.active) {
        mouse.targetX = width / 2
        mouse.targetY = height / 2
      }
      mouse.x += (mouse.targetX - mouse.x) * 0.06
      mouse.y += (mouse.targetY - mouse.y) * 0.06

      ctx.clearRect(0, 0, width, height)

      const radius = Math.max(width, height) * 0.45
      const blob = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, radius)
      blob.addColorStop(0, 'rgba(59, 130, 246, 0.20)')
      blob.addColorStop(0.45, 'rgba(99, 102, 241, 0.07)')
      blob.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = blob
      ctx.fillRect(0, 0, width, height)

      const speed = reduced ? 0 : dt / 16
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx * speed
        p.y += p.vy * speed
        if (p.x < -10) p.x = width + 10
        else if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        else if (p.y > height + 10) p.y = -10

        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const d2 = dx * dx + dy * dy
        const range = 180
        if (d2 < range * range) {
          const d = Math.sqrt(d2) || 1
          const f = ((range - d) / range) * 0.6 * speed
          p.x += (dx / d) * f
          p.y += (dy / d) * f
        }

        const glow = 1 - Math.min(1, Math.sqrt(d2) / 320)
        ctx.fillStyle = `rgba(147, 197, 253, ${0.25 + glow * 0.5})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.lineWidth = 0.6
      const linkDist = 110
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDist * linkDist) {
            const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.18
            ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
