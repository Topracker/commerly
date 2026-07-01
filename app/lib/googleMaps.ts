'use client'

// Carregador único do Google Maps JS API (com a biblioteca Places).
// Injeta o <script> uma vez e devolve sempre a mesma Promise, evitando
// carregar o SDK mais de uma vez quando vários componentes o pedem.

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''

// Usamos `any` para o namespace do Google Maps (sem @types/google.maps).
let promise: Promise<any> | null = null

export function carregarGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps só carrega no navegador'))
  }
  if (!GOOGLE_MAPS_KEY) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY não configurada'))
  }
  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google.maps)
  }
  if (promise) return promise

  promise = new Promise((resolve, reject) => {
    const cb = '__initGoogleMaps'
    ;(window as any)[cb] = () => resolve((window as any).google.maps)

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: GOOGLE_MAPS_KEY,
      libraries: 'places',
      language: 'pt-BR',
      region: 'BR',
      callback: cb,
      loading: 'async',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      promise = null
      reject(new Error('Falha ao carregar o Google Maps'))
    }
    document.head.appendChild(script)
  })
  return promise
}
