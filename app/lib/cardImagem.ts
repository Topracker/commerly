'use client'
// Geração de imagens de branding no client (canvas → PNG). Sem dependências.

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  const palavras = texto.split(' ')
  const linhas: string[] = []
  let linha = ''
  for (const p of palavras) {
    const teste = linha ? `${linha} ${p}` : p
    if (ctx.measureText(teste).width > maxW && linha) { linhas.push(linha); linha = p }
    else linha = teste
  }
  if (linha) linhas.push(linha)
  return linhas
}

/** Card quadrado de conquista (medalha / nível). Retorna dataURL PNG. */
export function gerarCardConquista(opts: { emoji: string; titulo: string; subtitulo: string; nome: string; cor: string }): string {
  const S = 1080
  const c = document.createElement('canvas'); c.width = S; c.height = S
  const ctx = c.getContext('2d')!
  // Fundo
  const g = ctx.createLinearGradient(0, 0, S, S)
  g.addColorStop(0, '#0d1117'); g.addColorStop(1, '#161b22')
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
  // Brilho da cor
  const rg = ctx.createRadialGradient(S / 2, 360, 40, S / 2, 360, 520)
  rg.addColorStop(0, `${opts.cor}44`); rg.addColorStop(1, '#00000000')
  ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S)
  // Borda
  ctx.strokeStyle = opts.cor; ctx.lineWidth = 8
  roundRect(ctx, 40, 40, S - 80, S - 80, 48); ctx.stroke()
  // Eyebrow
  ctx.textAlign = 'center'
  ctx.fillStyle = opts.cor; ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.fillText('COMMERLY · CONQUISTA', S / 2, 150)
  // Emoji
  ctx.font = '220px system-ui, sans-serif'
  ctx.fillText(opts.emoji, S / 2, 470)
  // Título
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 76px system-ui, sans-serif'
  ctx.fillText(opts.titulo, S / 2, 600)
  // Subtítulo
  ctx.fillStyle = '#9ca3af'; ctx.font = '34px system-ui, sans-serif'
  for (const [i, l] of wrap(ctx, opts.subtitulo, S - 200).slice(0, 2).entries()) ctx.fillText(l, S / 2, 660 + i * 44)
  // Nome
  ctx.fillStyle = '#6b7280'; ctx.font = '28px system-ui, sans-serif'
  ctx.fillText('Conquistado por', S / 2, 820)
  ctx.fillStyle = opts.cor; ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.fillText(opts.nome || 'Você', S / 2, 878)
  // Rodapé
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.fillText('Commerly', S / 2, 980)
  ctx.fillStyle = '#6b7280'; ctx.font = '24px system-ui, sans-serif'
  ctx.fillText('O Sistema Operacional do Pequeno Comércio', S / 2, 1018)
  return c.toDataURL('image/png')
}

/** Adesivo de story "Peça aqui pela Commerly" (retrato). Retorna dataURL PNG. */
export async function gerarStickerStory(opts: { lojaNome: string; qrDataUrl?: string; cor?: string }): Promise<string> {
  const W = 1080, H = 1350, cor = opts.cor || '#f5c34b'
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0d1117'); g.addColorStop(1, '#161b22')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = cor; ctx.lineWidth = 8
  roundRect(ctx, 40, 40, W - 80, H - 80, 48); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px system-ui, sans-serif'
  for (const [i, l] of wrap(ctx, opts.lojaNome, W - 200).slice(0, 2).entries()) ctx.fillText(l, W / 2, 180 + i * 74)
  ctx.fillStyle = cor; ctx.font = 'bold 88px system-ui, sans-serif'
  ctx.fillText('📲 Peça aqui', W / 2, 380)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 60px system-ui, sans-serif'
  ctx.fillText('pela Commerly', W / 2, 460)
  // QR (opcional)
  if (opts.qrDataUrl) {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = opts.qrDataUrl!
    })
    const size = 520, x = (W - size) / 2, y = 560
    ctx.fillStyle = '#ffffff'; roundRect(ctx, x - 24, y - 24, size + 48, size + 48, 32); ctx.fill()
    ctx.drawImage(img, x, y, size, size)
    ctx.fillStyle = '#9ca3af'; ctx.font = '32px system-ui, sans-serif'
    ctx.fillText('Aponte a câmera e faça seu pedido', W / 2, y + size + 90)
  }
  ctx.fillStyle = '#6b7280'; ctx.font = '28px system-ui, sans-serif'
  ctx.fillText('Powered by Commerly', W / 2, H - 90)
  return c.toDataURL('image/png')
}

/** Dispara o download de um dataURL. */
export function baixarDataUrl(dataUrl: string, nome: string) {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
}
