---
module: stage-web
tags: [openwebui, stt, tts, split-view]
problem_type: usage-guide
---

# Stage-Web：左 AIRI + 右 Open WebUI（语音驱动）

目标：stage-web 左侧 AIRI，右侧嵌入 Open WebUI UI，并用语音驱动（autoSend）。

## 1. 配置位置（3 个 LLM：Chat / STT / TTS）

- stage-web 配置持久化在浏览器 localStorage（不读 `apps/stage-tamagotchi/.env`）。
- 入口：Settings → Providers / Modules（Consciousness / Hearing / Speech）

### 1.1 Provider 凭据（key / baseURL）

- 填写位置：Settings → Providers
- 存储：
  - `settings/credentials/providers`
  - `settings/providers/added`

### 1.2 对话 LLM（Consciousness）

- 选择位置：Settings → Modules → Consciousness
- 存储：
  - `settings/consciousness/active-provider`
  - `settings/consciousness/active-model`

### 1.3 语音转文字 STT（Hearing）

- 选择位置：Settings → Modules → Hearing
- 存储：
  - `settings/hearing/active-provider`
  - `settings/hearing/active-model`
  - `settings/hearing/auto-send-enabled`
  - `settings/hearing/auto-send-delay`

### 1.4 文字转语音 TTS（Speech）

- 选择位置：Settings → Modules → Speech
- 存储：
  - `settings/speech/active-provider`
  - `settings/speech/active-model`
  - `settings/speech/voice`

## 2. 如何启动

### 2.1 启动 Open WebUI 前端（右侧 iframe）

```bash
pnpm -C open-webui run dev:5050
```

- 验证：`http://localhost:5050/` 返回 200

### 2.2 启动 AIRI stage-web（左侧 AIRI）

```bash
pnpm -F @proj-airi/stage-web dev
```

- 以终端输出的 `Local: http://localhost:517x/` 为准。

### 2.3 关键环境变量（可选）

- `VITE_OPENWEBUI_UI_BASE_URL=http://localhost:5050/`
- `VITE_AIRI_DEV_BOOTSTRAP`：dev 时写入 localStorage（入口：`apps/stage-web/src/main.ts`）

## 3. 当前数据流

### 3.1 语音输入（用户 → AIRI）

- 打开麦克风 + 打开 autoSend
- 转写 delta 追加到输入框 → autoSend 触发发送 → `chatOrchestrator.ingest(...)`

### 3.2 文本对话（AIRI 生成回复）

`chatOrchestrator.ingest(...)` 走 Consciousness 的 active provider/model 生成回复，UI 在左侧展示（并可触发 TTS）。

### 3.3 同步到 Open WebUI（AIRI 用户输入 → 右侧 UI 自动提交）

- AIRI 用户消息 compose 完成后，`useOpenWebUIBridge` 通过 `postMessage` 让 Open WebUI 自动提交。

## 4. ToDo（已知问题）

### 4.1 MCP 目前会报错无法执行

- 现象：AIRI 触发 MCP tool 失败（需补可复现日志）。
- ToDo：
  - 记录 tool name / 请求参数 / 返回栈
  - 确认 stage-web 的 MCP 运行时入口（本地 MCP server / CORS / browser sandbox）
  - 区分 web 与 electron 的能力边界
