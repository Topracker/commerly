'use client'
import { useEffect } from 'react'

export default function DevtoolsBlocker() {
  useEffect(() => {
    const bloquearMenu = (e: MouseEvent) => e.preventDefault()

    const bloquearTeclas = (e: KeyboardEvent) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault()
        return
      }
      // Ctrl+Shift+I / J / C (devtools, console, inspetor de elementos)
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
        e.preventDefault()
        return
      }
      // Ctrl+U (ver codigo-fonte)
      if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault()
        return
      }
    }

    document.addEventListener('contextmenu', bloquearMenu)
    document.addEventListener('keydown', bloquearTeclas)

    return () => {
      document.removeEventListener('contextmenu', bloquearMenu)
      document.removeEventListener('keydown', bloquearTeclas)
    }
  }, [])

  return null
}
