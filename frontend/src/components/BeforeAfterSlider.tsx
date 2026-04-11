import { useEffect, useRef, useState } from 'react'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  before: string
  after: string
  beforeAlt: string
  afterAlt: string
  label?: string
  caption?: string
  subcaption?: string
  index?: number
}

export default function BeforeAfterSlider({
  before,
  after,
  beforeAlt,
  afterAlt,
  label,
  caption,
  subcaption,
  index = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const hasPeekedRef = useRef(false)
  const peekControlsRef = useRef<AnimationPlaybackControls | null>(null)
  // Cached bounding rect (captured on pointer down, cleared on pointer up)
  // Avoids expensive getBoundingClientRect() reflows on every move event.
  const rectRef = useRef<{ left: number; width: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingClientXRef = useRef<number | null>(null)
  const [showHint, setShowHint] = useState(true)

  const position = useMotionValue(50)
  const clipPath = useTransform(position, (v) => `inset(0 ${100 - v}% 0 0)`)
  const handleLeft = useTransform(position, (v) => `${v}%`)

  const inView = useInView(containerRef, { once: true, margin: '-80px' })

  // Peek animation: pulses the slider on first view to hint at interactivity
  useEffect(() => {
    if (!inView || hasPeekedRef.current) return
    hasPeekedRef.current = true

    const delay = 400 + index * 220
    const timer = setTimeout(() => {
      peekControlsRef.current = animate(position, [50, 78, 22, 50], {
        duration: 2.2,
        times: [0, 0.35, 0.72, 1],
        ease: 'easeInOut',
      })
      peekControlsRef.current.then(() => {
        setTimeout(() => setShowHint(false), 1600)
      })
    }, delay)

    return () => clearTimeout(timer)
  }, [inView, index, position])

  // Clean up any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Merge all pending pointer moves into a single frame update.
  // Uses the cached rect so we never touch layout mid-drag.
  const flushPosition = () => {
    rafRef.current = null
    const clientX = pendingClientXRef.current
    const rect = rectRef.current
    if (clientX == null || !rect || rect.width === 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    position.set(pct < 0 ? 0 : pct > 100 ? 100 : pct)
  }

  const scheduleUpdate = (clientX: number) => {
    pendingClientXRef.current = clientX
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(flushPosition)
  }

  const stopPeek = () => {
    peekControlsRef.current?.stop()
    setShowHint(false)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    if (!el) return
    stopPeek()
    // Cache the rect once per drag — reading it on every move is the #1
    // cause of mobile jank (forces synchronous layout).
    const rect = el.getBoundingClientRect()
    rectRef.current = { left: rect.left, width: rect.width }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    draggingRef.current = true
    scheduleUpdate(e.clientX)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    scheduleUpdate(e.clientX)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    draggingRef.current = false
    rectRef.current = null
    pendingClientXRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stopPeek()
      position.set(Math.max(0, position.get() - 4))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      stopPeek()
      position.set(Math.min(100, position.get() + 4))
    }
  }

  return (
    <motion.figure
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{
        duration: 0.8,
        delay: index * 0.15,
        ease: [0.2, 0.8, 0.2, 1],
      }}
      className="group"
    >
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label={`Before and after comparison${caption ? `: ${caption}` : ''}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        aria-orientation="horizontal"
        tabIndex={0}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className="relative aspect-[4/5] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-[28px] bg-sky/30 shadow-elevated ring-1 ring-warm-dark/5 transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_28px_60px_-12px_rgba(232,151,94,0.35)] focus-visible:ring-4 focus-visible:ring-primary/40"
      >
        {/* AFTER image (base layer) */}
        <img
          src={after}
          alt={afterAlt}
          draggable={false}
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        {/* BEFORE image (clipped overlay) */}
        <motion.div
          style={{ clipPath }}
          className="pointer-events-none absolute inset-0 will-change-[clip-path]"
        >
          <img
            src={before}
            alt={beforeAlt}
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </motion.div>

        {/* Soft top gradient for badge legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-warm-dark/40 to-transparent" />

        {/* Badges */}
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-warm-dark/80 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[1.8px] text-white shadow-md backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-deep" />
          Before
        </div>
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[1.8px] text-white shadow-md">
          After
          <span className="h-1.5 w-1.5 rounded-full bg-butter" />
        </div>

        {/* Divider line */}
        <motion.div
          style={{ left: handleLeft }}
          className="pointer-events-none absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(45,42,38,0.08),0_0_24px_rgba(255,255,255,0.7)]"
        >
          {/* Handle */}
          <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(45,42,38,0.25)] ring-[3px] ring-primary transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
            <ChevronLeft className="h-4 w-4 text-primary" strokeWidth={3} />
            <ChevronRight className="h-4 w-4 text-primary" strokeWidth={3} />
            {/* Pulse ring */}
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 opacity-0 group-hover:opacity-100" />
          </div>
        </motion.div>

        {/* Drag hint */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: showHint ? 1 : 0,
            y: showHint ? 0 : 10,
          }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-warm-dark/80 px-4 py-1.5 text-[0.7rem] font-semibold text-white shadow-md backdrop-blur-md"
        >
          ← Drag to reveal →
        </motion.div>
      </div>

      {/* Caption */}
      {(label || caption || subcaption) && (
        <figcaption className="mt-5 flex items-start justify-between gap-4 px-1">
          <div className="flex-1">
            {label && (
              <p className="mb-0.5 font-accent text-2xl leading-none text-primary">
                {label}
              </p>
            )}
            {caption && (
              <h3 className="font-display text-[1.35rem] font-bold leading-tight text-warm-dark">
                {caption}
              </h3>
            )}
            {subcaption && (
              <p className="mt-1 text-sm text-warm-gray">{subcaption}</p>
            )}
          </div>
        </figcaption>
      )}
    </motion.figure>
  )
}
