// Dev-only bootstrap that seeds localStorage from VITE_AIRI_DEV_BOOTSTRAP
// before any Pinia store reads it. Active provider selection is also seeded so
// the app boots into a usable state without the user touching the Settings UI.
//
// Reads env var shape (JSON):
//   {
//     "activeChat":          "<providerId>",
//     "activeChatModel":     "<modelId>",
//     "activeSpeech":        "<providerId>",
//     "activeSpeechModel":   "<modelId>",
//     "activeTranscription": "<providerId>",
//     "stageModel":          "<modelId>" // optional, "" = static fallback
//     "providers": { ... }
//   }
//
// Localstorage keys mirror the keys used by AIRI stores:
//   settings/credentials/providers                   (object of provider configs)
//   settings/consciousness/active-provider           (default chat provider)
//   settings/consciousness/active-model              (default chat model)
//   settings/speech/active-provider                  (default TTS provider)
//   settings/speech/active-model                     (default TTS model)
//   settings/hearing/active-provider                 (default STT provider)
//   settings/stage/model                              (3D / 2D stage model id)
//
// Imported as the very first line of main.ts so values land before any store reads.

interface DevBootstrap {
  activeChat?: string
  activeChatModel?: string
  activeSpeech?: string
  activeSpeechModel?: string
  activeTranscription?: string
  stageModel?: string
  providers?: Record<string, Record<string, unknown>>
}

const RAW = (import.meta.env.VITE_AIRI_DEV_BOOTSTRAP as string | undefined)?.trim()
if (RAW) {
  try {
    const cfg = JSON.parse(RAW) as DevBootstrap

    // Seed credentials. Merge with whatever is already there so a partial
    // bootstrap doesn't wipe providers the user added through the UI.
    if (cfg.providers && Object.keys(cfg.providers).length > 0) {
      const existingRaw = localStorage.getItem('settings/credentials/providers')
      const existing = existingRaw ? JSON.parse(existingRaw) as Record<string, Record<string, unknown>> : {}
      const merged = { ...existing, ...cfg.providers }
      localStorage.setItem('settings/credentials/providers', JSON.stringify(merged))
    }

    // Seed active selections. Overwrite so the active provider follows the
    // latest env var across dev restarts.
    //
    // NOTICE: do NOT wrap in JSON.stringify. AIRI's stores use
    // `useLocalStorage<string>(key, defaultString)`. VueUse's `guessSerializerType`
    // picks the `string` serializer for string defaults — and the string
    // serializer reads via `v => v` (no JSON.parse) and writes via `String(v)`
    // (no JSON.stringify). Writing JSON.stringify('provider-id') leaves
    // `"provider-id"` (literal quote chars) in localStorage, which the store
    // reads back as the malformed string `"provider-id"` and then fails to
    // find provider metadata for it.
    const seedActive = (key: string, value: string | undefined) => {
      if (!value) return
      localStorage.setItem(key, value)
    }
    seedActive('settings/consciousness/active-provider', cfg.activeChat)
    seedActive('settings/consciousness/active-model', cfg.activeChatModel)
    seedActive('settings/speech/active-provider', cfg.activeSpeech)
    seedActive('settings/speech/active-model', cfg.activeSpeechModel)
    seedActive('settings/hearing/active-provider', cfg.activeTranscription)

    // Seed the active stage model id. Same string-serializer caveat as above:
    // `useLocalStorageManualReset<string>` writes via `String(v)`, so the raw
    // id (e.g. `preset-vrm-1`, not `"preset-vrm-1"`) is what the store expects.
    //
    // We write even when stageModel is `""` (empty string) so the renderer can
    // take the `disabled` branch — `useSettingsStageModel.updateStageModel()`
    // treats `!selectedModelId` as "no model" and shows the static fallback
    // in Stage.vue instead of a 3D model. The `cfg.stageModel !== undefined`
    // check distinguishes "field absent" (don't touch) from "field set to ''"
    // (explicitly disable), since empty string is falsy and would otherwise be
    // skipped by a truthiness check.
    if (cfg.stageModel !== undefined) {
      localStorage.setItem('settings/stage/model', cfg.stageModel)
    }

    // Migration: prior runs may have written JSON-quoted strings into the
    // active-provider keys. VueUse's string serializer reads them back as-is,
    // so `"provider-id"` round-trips into the store. Strip wrapping quotes
    // so the store sees the plain id.
    const activeKeys = [
      'settings/consciousness/active-provider',
      'settings/consciousness/active-model',
      'settings/speech/active-provider',
      'settings/speech/active-model',
      'settings/hearing/active-provider',
    ]
    for (const key of activeKeys) {
      const raw = localStorage.getItem(key)
      if (raw == null) continue
      const cleaned = /^"(.+)"$/.test(raw) ? raw.slice(1, -1) : raw
      if (cleaned !== raw)
        localStorage.setItem(key, cleaned)
    }
  }
  catch (err) {
    console.error('[airi-dev-bootstrap] failed to parse VITE_AIRI_DEV_BOOTSTRAP:', err)
  }
}