import { useEffect, useState } from 'react'

/**
 * Custom hook for count-up number animation.
 *
 * Uses requestAnimationFrame with easeOutQuad easing for a natural
 * deceleration feel. Respects the prefers-reduced-motion media query:
 * if the user prefers reduced motion, the value snaps to target immediately.
 *
 * @param target   - The final number to animate toward.
 * @param duration - Animation duration in ms (default 1000).
 * @param suffix   - Optional suffix appended to the displayed value (e.g. "%").
 * @returns The current animated value as a formatted string.
 */
export function useCountUp(
  target: number,
  duration: number = 1000,
  suffix: string = '',
): string {
  const [displayValue, setDisplayValue] = useState(target)

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (prefersReducedMotion || duration <= 0) {
      setDisplayValue(target)
      return
    }

    const startValue = 0
    const range = target - startValue
    let startTime: number | null = null
    let animationId: number

    const easeOutQuad = (t: number): number => t * (2 - t)

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp

      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutQuad(progress)

      const currentValue = startValue + range * easedProgress
      setDisplayValue(currentValue)

      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      } else {
        setDisplayValue(target)
      }
    }

    animationId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [target, duration])

  // Format the number: use fixed decimals for fractional results,
  // integer format for whole numbers
  const formatted =
    Number.isInteger(target)
      ? Math.round(displayValue).toLocaleString('zh-CN')
      : displayValue.toFixed(2)

  return `${formatted}${suffix}`
}
