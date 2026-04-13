import { useEffect, useRef } from 'react'
import useMatchStore from '@/store/matchStore'
import { HALF_DURATION_SECS } from '@/constants'

/**
 * useTimer
 * Increments elapsedSeconds every second while isRunning.
 * Auto-pauses at end of half.
 */
export function useTimer() {
  const { isRunning, elapsedSeconds, tickTimer, pauseTimer, nextHalf, half } =
    useMatchStore()
  const intervalRef = useRef(null)

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        const current = useMatchStore.getState().elapsedSeconds
        if (current >= HALF_DURATION_SECS) {
          clearInterval(intervalRef.current)
          pauseTimer()
          // Optionally auto-advance half: nextHalf()
        } else {
          tickTimer()
          useMatchStore.getState().resolveExpiredExclusions()
        }
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return { elapsedSeconds, isRunning, formatted: formatTime(elapsedSeconds), half }
}
