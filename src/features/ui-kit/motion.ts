/**
 * Motion system — Single source of truth for all animations.
 * Agents MUST use these values. Never add arbitrary transition durations.
 *
 * Safe properties to animate: transform, opacity, filter, color, background-color
 * NEVER animate: width, height, padding, margin, top, left, right, bottom
 * Reason: animating layout properties triggers reflow on every frame — kills performance.
 */

export const motion = {
  duration: {
    instant: "75ms", // Icon swaps, checkmarks appearing
    sm: "150ms", // Hover states, focus rings, small badge changes
    md: "200ms", // Entrances, state changes, dropdown open
    lg: "350ms", // Page transitions, drawer slides, modal appear
    xl: "500ms", // Complex sequences, orchestrated multi-element animations
  },
  easing: {
    // Default for most interactions — snaps into position, smooth stop
    default: "cubic-bezier(0.16, 1, 0.3, 1)", // ease-out-expo
    // Elements entering the screen
    enter: "cubic-bezier(0.0, 0.0, 0.2, 1)",
    // Elements leaving the screen
    exit: "cubic-bezier(0.4, 0.0, 1, 1)",
    // Subtle bounce — use RARELY, only for delightful micro-interactions
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  // Tailwind shorthand classes
  tw: {
    hover: "transition-colors duration-150 ease-out",
    enter: "transition-all duration-200 ease-out",
    exit: "transition-all duration-200 ease-in",
    drawer: "transition-transform duration-[350ms] ease-out",
    modal: "transition-all duration-200 ease-out",
  },
  // What to animate (always) vs what to NEVER animate
  safe: [
    "transform",
    "opacity",
    "filter",
    "color",
    "background-color",
    "border-color",
    "box-shadow",
  ],
  unsafe: [
    "width",
    "height",
    "padding",
    "margin",
    "top",
    "left",
    "right",
    "bottom",
    "max-height",
  ],
} as const;

// Tailwind classes for common animation patterns (require tailwindcss-animate)
export const motionClasses = {
  // Fade in from bottom (list items, cards entering)
  fadeInUp: "animate-in fade-in slide-in-from-bottom-2 duration-200",
  // Fade in (overlays, tooltips)
  fadeIn: "animate-in fade-in duration-150",
  // Zoom in (modals, dialogs)
  zoomIn: "animate-in zoom-in-95 fade-in duration-200",
  // Slide in from right (drawers, side panels)
  slideInRight: "animate-in slide-in-from-right duration-[350ms]",
} as const;
