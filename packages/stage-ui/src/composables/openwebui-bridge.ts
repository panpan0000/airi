import { onScopeDispose, ref } from 'vue'

import { useChatOrchestratorStore } from '../stores/chat'

export interface UseOpenWebUIBridgeOptions {
  baseUrl?: string
  enabled?: () => boolean
}

function getEnv(name: string, fallback?: string): string | undefined {
  const v = (import.meta as any).env?.[name]
  if (typeof v === 'string' && v.length > 0)
    return v
  return fallback
}

function normalizeOpenWebUIUiBaseUrl(raw: string): string {
  try {
    const u = new URL(raw)
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '8080') {
      u.port = '5050'
      u.pathname = '/'
      u.search = ''
      u.hash = ''
    }
    if (!u.pathname.endsWith('/'))
      u.pathname = `${u.pathname}/`
    return u.toString()
  }
  catch {
    return raw
  }
}

export function useOpenWebUIBridge(options: UseOpenWebUIBridgeOptions = {}) {
  const rawBaseUrl = options.baseUrl
    ?? getEnv('VITE_OPENWEBUI_UI_BASE_URL')
    ?? getEnv('VITE_OPENWEBUI_BASE_URL', 'http://localhost:5050/')!
  const baseUrl = normalizeOpenWebUIUiBaseUrl(rawBaseUrl)
  const isEnabled = options.enabled ?? (() => true)

  const ready = ref(false)
  const pending = ref<string[]>([])
  let iframeWindow: Window | null = null

  function isConfigured(): boolean {
    return Boolean(baseUrl)
  }

  function registerIframe(el: HTMLIFrameElement | null) {
    if (!el)
      return
    el.addEventListener('load', () => {
      ready.value = true
      iframeWindow = el.contentWindow
      for (const msg of pending.value) {
        iframeWindow?.postMessage(
          { type: 'input:prompt:submit', text: msg },
          new URL(baseUrl).origin,
        )
      }
      pending.value = []
    })
  }

  function forwardToOWEB(text: string) {
    if (!ready.value || !iframeWindow) {
      pending.value.push(text)
      return
    }
    iframeWindow.postMessage(
      { type: 'input:prompt:submit', text },
      new URL(baseUrl).origin,
    )
  }

  const chat = useChatOrchestratorStore()
  const unsubscribe = chat.onAfterMessageComposed(async (message) => {
    if (!isEnabled())
      return
    if (!isConfigured())
      return
    if (!message || !message.trim())
      return
    console.info('[openwebui-bridge] OWEB forward:', message)
    forwardToOWEB(message)
  })

  onScopeDispose(() => unsubscribe?.())

  return {
    baseUrl,
    isConfigured,
    ready,
    forwardToOWEB,
    registerIframe,
  }
}
