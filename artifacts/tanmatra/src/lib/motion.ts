/**
 * Motion tokens for the Tanmatra design system.
 *
 * Mirrors the CSS custom properties declared in `index.css` so that
 * Framer Motion / JS-driven animations stay in lockstep with CSS
 * transitions. Always import from here instead of hardcoding numbers.
 */

export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  slower: 0.52,
} as const;

export const EASE = {
  standard: [0.2, 0, 0, 1] as const,
  emphasized: [0.3, 0, 0, 1] as const,
  decelerate: [0, 0, 0, 1] as const,
  accelerate: [0.3, 0, 1, 1] as const,
} as const;

export const SPRING = {
  soft: { type: "spring" as const, stiffness: 220, damping: 26, mass: 0.9 },
  snappy: { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 },
  bouncy: { type: "spring" as const, stiffness: 320, damping: 18, mass: 0.7 },
} as const;

export const FADE_IN_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.slow, ease: EASE.standard },
};

export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE.standard },
};

import type { Variants } from "framer-motion";

/**
 * BreathingScale — gentle scale 1 → 1.06 → 1 over 4 s.
 * Use on the UPI waiting state or any "mindful" pulse.
 * Callers should apply `@media (prefers-reduced-motion)` via the
 * `reducedMotion` prop on <motion.div> or check it themselves.
 */
export const BREATHING_SCALE: Variants = {
  idle: { scale: 1 },
  breathe: {
    scale: [1, 1.06, 1],
    transition: { duration: 4, ease: "easeInOut", repeat: Infinity },
  },
};

/**
 * PulseOpacity — for ghost-fill layers and translucent progress previews.
 */
export const PULSE_OPACITY: Variants = {
  idle: { opacity: 0 },
  pulse: {
    opacity: [0.35, 0.65, 0.35],
    transition: { duration: 2, ease: "easeInOut", repeat: Infinity },
  },
  static: { opacity: 0.45 },
};

/**
 * AccordionHeight — collapse to 0 / expand to auto.
 * Use with layout="position" on the parent and overflow-hidden on the container.
 */
export const ACCORDION_HEIGHT: Variants = {
  open: {
    height: "auto",
    opacity: 1,
    transition: { duration: DURATION.slow, ease: EASE.standard },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: DURATION.base, ease: EASE.accelerate },
  },
};

/** Panel slides in from the right edge. */
export const PANEL_SLIDE: Variants = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: SPRING.soft,
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: { duration: DURATION.slow, ease: EASE.accelerate },
  },
};

/** Backdrop fade. */
export const BACKDROP: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.base } },
};
