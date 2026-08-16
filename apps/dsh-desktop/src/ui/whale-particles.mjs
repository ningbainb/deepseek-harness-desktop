const MASK_WIDTH = 720
const MASK_HEIGHT = 420

function createRandom(seed = 0x5d51) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function traceWhale(context) {
  context.beginPath()
  context.moveTo(69, 211)
  context.bezierCurveTo(60, 157, 119, 111, 226, 99)
  context.bezierCurveTo(341, 87, 448, 126, 519, 179)
  context.bezierCurveTo(552, 164, 581, 126, 620, 107)
  context.bezierCurveTo(616, 147, 604, 178, 578, 199)
  context.bezierCurveTo(616, 207, 644, 232, 657, 270)
  context.bezierCurveTo(617, 262, 583, 247, 550, 222)
  context.bezierCurveTo(526, 267, 482, 293, 420, 304)
  context.bezierCurveTo(349, 316, 281, 305, 222, 283)
  context.bezierCurveTo(193, 329, 153, 351, 111, 332)
  context.bezierCurveTo(145, 309, 163, 286, 166, 260)
  context.bezierCurveTo(112, 253, 78, 236, 69, 211)
  context.closePath()
  context.fill()

  context.beginPath()
  context.moveTo(251, 278)
  context.bezierCurveTo(278, 317, 310, 342, 350, 350)
  context.bezierCurveTo(332, 316, 316, 290, 292, 268)
  context.closePath()
  context.fill()
}

function createParticleField() {
  const mask = document.createElement('canvas')
  mask.width = MASK_WIDTH
  mask.height = MASK_HEIGHT
  const context = mask.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#fff'
  traceWhale(context)
  const pixels = context.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data
  const random = createRandom()
  const particles = []
  const step = 7
  for (let y = 0; y < MASK_HEIGHT; y += step) {
    for (let x = 0; x < MASK_WIDTH; x += step) {
      const sampleX = Math.min(MASK_WIDTH - 1, Math.round(x + (random() - 0.5) * step))
      const sampleY = Math.min(MASK_HEIGHT - 1, Math.round(y + (random() - 0.5) * step))
      if (pixels[(sampleY * MASK_WIDTH + sampleX) * 4 + 3] < 96 || random() < 0.28) continue
      particles.push({
        x: sampleX,
        y: sampleY,
        size: 0.55 + random() * 1.45,
        alpha: 0.22 + random() * 0.72,
        phase: random() * Math.PI * 2,
        delay: random() * 0.7,
      })
    }
  }
  return particles
}

function easeOut(value) {
  const bounded = Math.max(0, Math.min(1, value))
  return 1 - (1 - bounded) ** 3
}

export function mountParticleWhale(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) return () => {}
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  const particles = createParticleField()
  const random = createRandom(0x1eaf)
  const ambient = Array.from({ length: 78 }, () => ({
    x: random(),
    y: random(),
    size: 0.4 + random() * 1.2,
    speed: 0.08 + random() * 0.18,
    phase: random() * Math.PI * 2,
  }))
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = 0
  let height = 0
  let frame
  let stopped = false
  const startedAt = performance.now()

  const resize = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  const draw = (now) => {
    if (stopped) return
    const elapsed = (now - startedAt) / 1000
    context.clearRect(0, 0, width, height)
    context.globalCompositeOperation = 'lighter'

    for (const mote of ambient) {
      const x = mote.x * width + Math.sin(elapsed * mote.speed + mote.phase) * 14
      const y = (mote.y * height - elapsed * 3 * mote.speed + height) % height
      context.fillStyle = `rgba(77, 164, 218, ${0.08 + mote.size * 0.035})`
      context.beginPath()
      context.arc(x, y, mote.size, 0, Math.PI * 2)
      context.fill()
    }

    const whaleWidth = Math.min(width * 0.61, 820)
    const scale = whaleWidth / MASK_WIDTH
    const centerX = width < 920 ? width * 0.61 : width * 0.72
    const centerY = height * 0.43
    const reveal = reducedMotion ? 1 : easeOut(elapsed / 1.7)
    const float = reducedMotion ? 0 : Math.sin(elapsed * 0.48) * 5

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index]
      const localReveal = easeOut((reveal - particle.delay * 0.25) / 0.82)
      if (localReveal <= 0) continue
      const wave = reducedMotion ? 0 : Math.sin(elapsed * 0.82 + particle.phase + particle.x * 0.012) * 1.9
      const targetX = centerX + (particle.x - MASK_WIDTH / 2) * scale
      const targetY = centerY + (particle.y - MASK_HEIGHT / 2) * scale + float + wave
      const originX = centerX + whaleWidth * 0.44
      const x = originX + (targetX - originX) * localReveal
      const y = centerY + (targetY - centerY) * localReveal
      const pulse = reducedMotion ? 1 : 0.82 + Math.sin(elapsed * 1.1 + particle.phase) * 0.18
      const radius = particle.size * scale * pulse
      const tailGlow = Math.max(0, (particle.x - 500) / 220)
      context.fillStyle = `rgba(${104 + Math.round(tailGlow * 58)}, ${193 + Math.round(tailGlow * 35)}, 242, ${particle.alpha * localReveal})`
      context.beginPath()
      context.arc(x, y, Math.max(0.35, radius), 0, Math.PI * 2)
      context.fill()

      if (index % 19 === 0 && localReveal > 0.75) {
        context.strokeStyle = `rgba(83, 177, 226, ${particle.alpha * 0.14})`
        context.lineWidth = 0.55
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x - 9 * scale, y + Math.sin(particle.phase) * 5 * scale)
        context.stroke()
      }
    }
    const eyeX = centerX + (137 - MASK_WIDTH / 2) * scale
    const eyeY = centerY + (180 - MASK_HEIGHT / 2) * scale + float
    context.shadowColor = 'rgba(188, 244, 255, 0.9)'
    context.shadowBlur = 14
    context.fillStyle = `rgba(220, 251, 255, ${0.76 * reveal})`
    context.beginPath()
    context.arc(eyeX, eyeY, Math.max(1.1, 1.8 * scale), 0, Math.PI * 2)
    context.fill()
    context.shadowBlur = 0
    context.globalCompositeOperation = 'source-over'
    if (!reducedMotion) frame = window.requestAnimationFrame(draw)
  }

  resize()
  window.addEventListener('resize', resize)
  frame = window.requestAnimationFrame(draw)
  return () => {
    stopped = true
    window.cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
  }
}
