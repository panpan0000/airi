import type { ChatProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { useCharacterStore } from '../stores/character'
import { useChatOrchestratorStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useProvidersStore } from '../stores/providers'

export interface UseOpenWebUIBridgeOptions {
  baseUrl?: string
  enabled?: () => boolean
  summarize?: boolean
}

function isChatProvider(provider: unknown): provider is ChatProvider {
  return Boolean(provider) && typeof (provider as any).chat === 'function'
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
  const isSummaryEnabled = options.summarize ?? false

  const ready = ref(false)
  const pending = ref<Array<{ requestId: string, text: string }>>([])
  let iframeWindow: Window | null = null
  const handledSummaryRequestIds = new Set<string>()
  const activeSummaryRequestIds = new Set<string>()

  function isConfigured(): boolean {
    return Boolean(baseUrl)
  }

  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const chatSession = useChatSessionStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const characterStore = useCharacterStore()

  async function summarizeAndSpeakOpenWebUIAnswer(text: string) {
    if (!isSummaryEnabled)
      return
    const providerId = activeProvider.value
    const modelId = activeModel.value
    if (!providerId || !modelId)
      return
    const prompt = `你是AIRI。请把用户给出的长回答概括为10~50字中文，直接给结论，不要展开，不要列点，不要解释。`
    try {
      const provider = await providersStore.getProviderInstance(providerId)
      if (!isChatProvider(provider))
        return
      const res = await generateText({
        ...provider.chat(modelId),
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text },
        ],
        headers: { 'Accept-Encoding': 'identity' },
      })
      const raw = (res.text || '').trim()
      if (!raw)
        return
      const compact = raw.replace(/\s+/g, ' ').trim()
      const clipped = compact.length > 50 ? compact.slice(0, 50) : compact
      const sessionId = activeSessionId.value
      if (sessionId) {
        chatSession.appendSessionMessage(sessionId, {
          role: 'assistant',
          content: clipped,
          slices: [],
          tool_results: [],
          createdAt: Date.now(),
          id: nanoid(),
        })
      }
      await characterStore.emitTextOutput(clipped)
    }
    catch (err) {
      console.warn('[openwebui-bridge] summarize failed:', errorMessageFrom(err))
    }
  }

  function handleOpenWebUIMessage(event: MessageEvent) {
    if (!isEnabled() || !isSummaryEnabled)
      return
    const origin = (() => {
      try {
        return new URL(baseUrl).origin
      }
      catch {
        return ''
      }
    })()
    if (!origin || event.origin !== origin)
      return
    const data = event.data as any
    if (!data || typeof data !== 'object')
      return
    if (data.type !== 'openwebui:assistant:final')
      return
    if (typeof data.text !== 'string' || !data.text.trim())
      return
    const requestId = typeof data.requestId === 'string' ? data.requestId : ''
    const normalizedRequestId = requestId.trim()
    if (normalizedRequestId) {
      if (handledSummaryRequestIds.has(normalizedRequestId) || activeSummaryRequestIds.has(normalizedRequestId))
        return
      activeSummaryRequestIds.add(normalizedRequestId)
    }
    void summarizeAndSpeakOpenWebUIAnswer(data.text).finally(() => {
      if (normalizedRequestId) {
        activeSummaryRequestIds.delete(normalizedRequestId)
        handledSummaryRequestIds.add(normalizedRequestId)
      }
    })
  }

  function registerIframe(el: HTMLIFrameElement | null) {
    if (!el)
      return
    el.addEventListener('load', () => {
      ready.value = true
      iframeWindow = el.contentWindow
      for (const msg of pending.value) {
        iframeWindow?.postMessage(
          { type: 'input:prompt:submit', text: msg.text, requestId: msg.requestId },
          new URL(baseUrl).origin,
        )
      }
      pending.value = []
    })
    window.addEventListener('message', handleOpenWebUIMessage)
  }

  function forwardToOWEB(text: string) {
    const requestId = nanoid()
    if (!ready.value || !iframeWindow) {
      pending.value.push({ requestId, text })
      return requestId
    }
    iframeWindow.postMessage(
      { type: 'input:prompt:submit', text, requestId },
      new URL(baseUrl).origin,
    )
    return requestId
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

  onScopeDispose(() => {
    unsubscribe?.()
    window.removeEventListener('message', handleOpenWebUIMessage)
  })

  return {
    baseUrl,
    isConfigured,
    ready,
    forwardToOWEB,
    registerIframe,
  }
}
