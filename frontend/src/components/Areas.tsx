import { useEffect, useRef } from 'react'
import { Home, TreePine, Building2, Wheat, Navigation } from 'lucide-react'
import { motion } from 'framer-motion'
import car1 from '../assets/car1.JPG'
import car2 from '../assets/car2.JPG'
import equip from '../assets/equip.JPG'
import './HoverCarousel.scss'

const areas = [
  { icon: Home, label: 'Davis' },
  { icon: Building2, label: 'Sacramento' },
  { icon: TreePine, label: 'Woodland' },
  { icon: Home, label: 'El Macero' },
  { icon: Wheat, label: 'Mace Ranch' },
  { icon: Home, label: 'West Sacramento' },
  { icon: Navigation, label: 'Nearby Areas' },
]

const images = [
  car1,
  car2,
  equip,
  'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=400&fit=crop',
  'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=600&h=400&fit=crop',
]

// Hover-Carousel component
// By Yair Even-Or
// written in jQuery 2013 -> refactored to vanilla 2020
// https://github.com/yairEO/hover-carousel
function initHoverCarousel(elm: HTMLElement) {
  const wrap = elm.querySelector('ul')!.parentNode as HTMLElement

  let containerWidth = 0
  let scrollWidth = 0
  let posFromLeft = 0
  let padding = 0
  let pos = 0
  let scrollPos = 0
  let animated: ReturnType<typeof setTimeout> | null = null
  let mouseMoveRAF: number | null = null

  // --- Shared: update fade indicators based on scroll position ---
  function updateIndicators() {
    const cw = wrap.clientWidth
    const sw = wrap.scrollWidth
    const sl = wrap.scrollLeft
    const prevMore = sl > 0
    const nextMore = sw - cw - sl > 5
    elm.setAttribute(
      'data-at',
      (prevMore ? 'left ' : ' ') + (nextMore ? 'right' : ''),
    )
    elm.style.setProperty('--scrollWidth', (cw / sw) * 100 + '%')
    elm.style.setProperty('--scrollLleft', (sl / sw) * 100 + '%')
  }

  // --- Desktop: hover-based scrolling ---
  function onMouseEnter(e: MouseEvent) {
    containerWidth = wrap.clientWidth
    scrollWidth = wrap.scrollWidth
    padding = 0.2 * containerWidth
    posFromLeft = wrap.getBoundingClientRect().left
    const stripePos = e.pageX - padding - posFromLeft
    pos = stripePos / (containerWidth - padding * 2)
    scrollPos = (scrollWidth - containerWidth) * pos

    wrap.style.scrollBehavior = 'smooth'

    if (scrollPos < 0) scrollPos = 0
    if (scrollPos > scrollWidth - containerWidth)
      scrollPos = scrollWidth - containerWidth

    wrap.scrollLeft = scrollPos
    updateIndicators()

    if (animated) clearTimeout(animated)
    animated = setTimeout(() => {
      animated = null
      wrap.style.scrollBehavior = 'auto'
    }, 200)
  }

  function onMouseMove(e: MouseEvent) {
    if (animated) return

    const stripePos = Math.max(0, e.pageX - padding - posFromLeft)
    pos = stripePos / (containerWidth - padding * 2)
    scrollPos = (scrollWidth - containerWidth) * pos

    wrap.scrollLeft = scrollPos
    updateIndicators()
  }

  function onMouseMoveRAF(e: MouseEvent) {
    if (mouseMoveRAF) cancelAnimationFrame(mouseMoveRAF)
    mouseMoveRAF = requestAnimationFrame(() => onMouseMove(e))
  }

  // --- Mobile: touch swipe scrolling ---
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  if (isTouchDevice) {
    wrap.style.overflowX = 'auto'
    wrap.style.webkitOverflowScrolling = 'touch'
    // Hide scrollbar on touch devices — let users swipe naturally
    wrap.style.scrollbarWidth = 'none' // Firefox
    ;(wrap.style as unknown as Record<string, string>).msOverflowStyle = 'none' // IE

    // Update indicators on scroll
    let scrollRAF: number | null = null
    function onScroll() {
      if (scrollRAF) cancelAnimationFrame(scrollRAF)
      scrollRAF = requestAnimationFrame(updateIndicators)
    }
    wrap.addEventListener('scroll', onScroll, { passive: true })

    // Set initial indicator state
    requestAnimationFrame(updateIndicators)
  }

  elm.addEventListener('mouseenter', onMouseEnter)
  elm.addEventListener('mousemove', onMouseMoveRAF)

  return () => {
    elm.removeEventListener('mouseenter', onMouseEnter)
    elm.removeEventListener('mousemove', onMouseMoveRAF)
  }
}

export default function Areas() {
  const carouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!carouselRef.current) return
    return initHoverCarousel(carouselRef.current)
  }, [])

  return (
    <section id="areas" className="bg-white px-6 py-24">
      <div className="mx-auto mb-12 max-w-[560px] text-center">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[2px] text-secondary">
          Service Areas
        </p>
        <h2 className="mb-4 font-display text-4xl font-bold text-warm-dark">
          We Come to You!
        </h2>
        <p className="text-[1.05rem] text-warm-gray">
          Dogs in Fashion proudly serves the greater Davis and Sacramento area.
          Not sure if we cover your neighborhood? Just text Doris!
        </p>
      </div>

      {/* Hover Carousel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5 }}
        className="mx-auto mb-12 max-w-[900px]"
      >
        <div className="carousel" ref={carouselRef}>
          <div className="wrap">
            <ul>
              {images.map((src, i) => (
                <li key={i}>
                  <img src={src} alt={`Dogs in Fashion mobile grooming ${i + 1}`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-[800px]"
      >
        <div className="mb-8 flex flex-wrap justify-center gap-3">
          {areas.map((a, i) => (
            <motion.span
              key={a.label}
              whileHover={{ scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="inline-flex items-center gap-2 rounded-full bg-sky px-5 py-2.5 text-[0.92rem] font-semibold text-secondary transition-colors hover:bg-sky-deep"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </motion.span>
          ))}
        </div>

        <p className="text-center text-[0.92rem] text-warm-gray">
          Don't see your city?{' '}
          <a
            href="sms:+19162871878"
            className="font-bold text-secondary no-underline hover:underline"
          >
            Text Doris
          </a>{' '}
          to ask — we're always expanding!
        </p>
      </motion.div>
    </section>
  )
}
