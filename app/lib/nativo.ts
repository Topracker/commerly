// Ponte com o app Android nativo (Capacitor, pasta mobile/).
//
// O app nativo carrega o próprio commerly.com.br num WebView e injeta
// `window.Capacitor`. Não importamos @capacitor/core no site: os plugins são
// pegos pelo nome no objeto global, então no navegador comum tudo aqui vira
// no-op e o bundle web não cresce.

type PluginNativo = Record<string, (...args: any[]) => any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, PluginNativo | undefined>
  registerPlugin?: (nome: string) => PluginNativo
  isPluginAvailable?: (nome: string) => boolean
}

function cap(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** true só dentro do app Android da Commerly (não no Chrome/PWA). */
export function ehAppNativo(): boolean {
  try { return !!cap()?.isNativePlatform?.() } catch { return false }
}

/** Plugin nativo pelo nome (ex.: 'Browser', 'App', 'BackgroundGeolocation'), ou null fora do app. */
export function pluginNativo(nome: string): PluginNativo | null {
  if (!ehAppNativo()) return null
  const c = cap()!
  // Só devolve plugins que existem neste build do app: um proxy de plugin
  // ausente rejeita toda chamada e quebraria o fallback web.
  if (c.isPluginAvailable && !c.isPluginAvailable(nome)) return null
  return c.Plugins?.[nome] ?? c.registerPlugin?.(nome) ?? null
}
