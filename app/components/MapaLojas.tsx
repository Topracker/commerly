'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

export type LojaMapa = {
  id: string
  nome: string
  tipo?: string
  localizacao?: string
  latitude?: number | null
  longitude?: number | null
  media?: number
  totalAval?: number
}

type Props = {
  lojas: LojaMapa[]
  onVer: (id: string) => void
  /** Posição do usuário [lat, lng], se a localização foi autorizada. */
  userPos?: [number, number] | null
}

// Centro padrão: Brasil (usado só se nada tiver coordenadas).
const CENTRO_BR: [number, number] = [-14.235, -51.925]

// Pin SVG (verde da marca) como divIcon — evita depender das imagens padrão
// do Leaflet, que quebram com o bundler do Next.
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="#16a34a" stroke="#ffffff" stroke-width="1.5">' +
  '<path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z"/><circle cx="12" cy="11" r="2.2" fill="#ffffff" stroke="none"/></svg>'

// Ponto do usuário — círculo azul com halo.
const USER_SVG =
  '<div style="position:relative;width:18px;height:18px">' +
  '<span style="position:absolute;inset:-6px;border-radius:50%;background:rgba(37,99,235,0.25)"></span>' +
  '<span style="position:absolute;inset:0;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)"></span>' +
  '</div>'

export function MapaLojas({ lojas, onVer, userPos }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const [pronto, setPronto] = useState(false)

  // Ref para o listener do popup sempre chamar a versão atual do callback.
  const onVerRef = useRef(onVer)
  useEffect(() => { onVerRef.current = onVer }, [onVer])

  // Inicializa o mapa uma vez (Leaflet só roda no navegador → import dinâmico).
  useEffect(() => {
    let cancelado = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default || mod
      if (cancelado || !divRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(divRef.current).setView(CENTRO_BR, 4)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      // O container acabou de montar; garante o cálculo correto do tamanho.
      setTimeout(() => map.invalidateSize(), 0)
      setPronto(true)
    })
    return () => {
      cancelado = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // (Re)desenha os marcadores quando as lojas ou a posição do usuário mudam.
  useEffect(() => {
    const L = LRef.current
    if (!pronto || !L || !mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()

    const icon = L.divIcon({
      html: PIN_SVG,
      className: 'commerly-pin',
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -26],
    })

    const pontos: [number, number][] = []
    for (const loja of lojas) {
      if (loja.latitude == null || loja.longitude == null) continue
      const ll: [number, number] = [Number(loja.latitude), Number(loja.longitude)]
      const marker = L.marker(ll, { icon, title: loja.nome }).addTo(layerRef.current)
      marker.bindPopup(conteudoCard(loja))
      marker.on('popupopen', () => {
        const btn = document.getElementById(`ver-loja-${loja.id}`)
        if (btn) btn.onclick = () => onVerRef.current(loja.id)
      })
      pontos.push(ll)
    }

    // Pin do usuário ("Você está aqui").
    if (userPos) {
      const userIcon = L.divIcon({ html: USER_SVG, className: 'commerly-user', iconSize: [18, 18], iconAnchor: [9, 9] })
      L.marker(userPos, { icon: userIcon, zIndexOffset: 1000 })
        .addTo(layerRef.current)
        .bindPopup('<b>Você está aqui</b>')
    }

    // Enquadramento: prioriza o usuário; senão, ajusta às lojas.
    if (userPos) {
      // Mostra o usuário e as lojas próximas (as mais distantes podem ficar fora).
      const proximas = pontos.slice(0, 8)
      mapRef.current.fitBounds([userPos, ...proximas], { padding: [50, 50], maxZoom: 15 })
    } else if (pontos.length === 1) {
      mapRef.current.setView(pontos[0], 15)
    } else if (pontos.length > 1) {
      mapRef.current.fitBounds(pontos, { padding: [40, 40] })
    }
  }, [lojas, pronto, userPos])

  const semCoord = lojas.length > 0 && lojas.every((l) => l.latitude == null || l.longitude == null)

  return (
    <div>
      <div ref={divRef} className="w-full h-[70vh] rounded-2xl overflow-hidden bg-gray-900 z-0" />
      {semCoord && (
        <p className="text-gray-500 text-xs text-center mt-2">
          Nenhum comércio com localização no mapa ainda.
        </p>
      )}
    </div>
  )
}

function conteudoCard(loja: LojaMapa): string {
  const esc = (s?: string) =>
    (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const nota =
    loja.totalAval && loja.totalAval > 0
      ? `<div style="color:#eab308;font-size:12px;margin-top:2px">★ ${loja.media?.toFixed(1)} (${loja.totalAval})</div>`
      : ''
  const local = loja.localizacao
    ? `<div style="color:#4b5563;font-size:12px;margin-top:2px">${esc(loja.localizacao)}</div>`
    : ''
  return `
    <div style="min-width:180px;font-family:system-ui,sans-serif;color:#111827">
      <div style="font-weight:600;font-size:14px">${esc(loja.nome)}</div>
      ${loja.tipo ? `<div style="color:#6b7280;font-size:12px">${esc(loja.tipo)}</div>` : ''}
      ${nota}
      ${local}
      <button id="ver-loja-${loja.id}" style="margin-top:8px;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;width:100%">
        Ver perfil →
      </button>
    </div>`
}

export default MapaLojas
