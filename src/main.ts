import './style.css'
import {
  waitForEvenAppBridge,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'

const CONTAINER_ID = 100
const CONTAINER_NAME = 'safeText'
const WS_URL = import.meta.env.VITE_WS_URL as string
const AUTO_START_ON_READY = true
const AUTO_RESTART_AFTER_RESULT = false
const IS_DEV = import.meta.env.DEV

const DEFAULT_GLASS_TEXT = [
  '越南语翻译已就绪',
  '中文输入待命',
  '打开插件后自动开始',
  '停止后等待结果',
  '可再次开始下一轮',
].join('\n')

type AppState =
  | 'booting'
  | 'ready'
  | 'connecting'
  | 'recording'
  | 'processing'
  | 'result'
  | 'error'

type WsStatusMessage = {
  type: 'status'
  message?: string
}

type WsPartialTextMessage = {
  type: 'partial_text'
  text?: string
}

type WsFinalResultMessage = {
  type: 'final_result'
  recognizedText?: string
  translatedText?: string
  autoReply?: string
  meaningText?: string
  chineseMeaning?: string
  pronunciationText?: string
  readingText?: string
}

type WsErrorMessage = {
  type: 'error'
  message?: string
}

type WsMessage =
  | WsStatusMessage
  | WsPartialTextMessage
  | WsFinalResultMessage
  | WsErrorMessage

let bridgeRef: any = null
let ws: WebSocket | null = null
let wsReady = false
let isRecording = false
let currentSessionId = ''
let unsubscribeEvenHubEvent: null | (() => void) = null
let pageCreated = false
let lastContent = DEFAULT_GLASS_TEXT
let appState: AppState = 'booting'
let pendingAutoStart = false
let reconnectTimer: number | null = null
let intentionalStop = false

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot) {
  appRoot.innerHTML = `
  <div style="padding:24px;color:white;font-family:monospace;">
    <h1>Even G2 VN Translator</h1>
    <p id="status">等待初始化...</p>
    <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
      <button id="toggle-btn" style="padding:12px 18px;border:none;border-radius:12px;background:#86efac;color:#052e16;font-weight:700;">停止录音</button>
      <button id="restart-btn" style="padding:12px 18px;border:none;border-radius:12px;background:#7dd3fc;color:#082f49;font-weight:700;">重新开始</button>
    </div>
    <pre id="debug" style="margin-top:20px;white-space:pre-wrap;font-size:14px;line-height:1.5;display:${IS_DEV ? 'block' : 'none'};">等待初始化...</pre>
  </div>
  `
}

function setStatus(text: string) {
  const el = document.querySelector<HTMLElement>('#status')
  if (el) el.textContent = text
}

function setDebug(text: string) {
  if (!IS_DEV) return
  const el = document.querySelector<HTMLElement>('#debug')
  if (el) el.textContent = text
}

function appendDebug(text: string) {
  if (!IS_DEV) return
  const el = document.querySelector<HTMLElement>('#debug')
  if (!el) return
  el.textContent = `${el.textContent}\n${text}`
}

function setAppState(next: AppState, statusText?: string) {
  appState = next
  if (statusText) setStatus(statusText)
  updateButtons()
  appendDebug(`[STATE] -> ${next}`)
}

function updateButtons() {
  const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle-btn')
  const restartBtn = document.querySelector<HTMLButtonElement>('#restart-btn')
  if (!toggleBtn || !restartBtn) return

  if (appState === 'recording') {
    toggleBtn.textContent = '停止录音'
    toggleBtn.disabled = false
    restartBtn.disabled = true
    return
  }

  if (appState === 'processing') {
    toggleBtn.textContent = '处理中...'
    toggleBtn.disabled = true
    restartBtn.disabled = true
    return
  }

  toggleBtn.textContent = '开始录音'
  toggleBtn.disabled = appState === 'booting' || appState === 'connecting'
  restartBtn.disabled = appState === 'booting' || appState === 'connecting'
}

function normalizeDisplayText(input: string) {
  let text = String(input || '')
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text
}

function cutLine(input: string, maxChars: number) {
  const line = normalizeDisplayText(input)
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line
}

function buildGlassText(params: {
  vietnamese?: string
  chinese?: string
  autoReply?: string
  meaning?: string
  pronunciation?: string
}) {
  const line1 = cutLine(params.vietnamese || '', 26)
  const line2 = cutLine(params.chinese || '', 24)
  const line3 = cutLine(params.autoReply || '', 26)
  const line4 = cutLine(params.meaning || '', 24)
  const line5 = cutLine(params.pronunciation || '', 24)
  return [line1, line2, line3, line4, line5].join('\n')
}

function buildStartUpPage(content: string) {
  return {
    textObject: [
      {
        xPosition: 20,
        yPosition: 20,
        width: 460,
        height: 220,
        borderWidth: 1,
        borderColor: 1,
        borderRadius: 8,
        paddingLength: 12,
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content,
        isEventCapture: 1,
      },
    ],
  }
}

async function createDisplayPage(content: string, trigger: string) {
  if (!bridgeRef) return
  try {
    const displayContent = normalizeDisplayText(content)
    const firstPage = buildStartUpPage(displayContent)
    const createResult = await bridgeRef.createStartUpPageContainer(firstPage)
    appendDebug(`[${trigger}] create result: ${createResult}`)

    if (createResult === 0) {
      pageCreated = true
      lastContent = displayContent
      return
    }

    setAppState('error', `创建失败，返回码: ${createResult}`)
  } catch (error: any) {
    console.error(error)
    appendDebug(`[${trigger}] create error: ${error?.message || '未知错误'}`)
    setAppState('error', '创建异常')
  }
}

async function upgradeDisplayText(content: string) {
  if (!bridgeRef) return
  const displayContent = normalizeDisplayText(content)

  if (!pageCreated) {
    await createDisplayPage(displayContent, 'AUTO_CREATE')
    return
  }

  try {
    const upgradePayload = new TextContainerUpgrade({
      containerID: CONTAINER_ID,
      containerName: CONTAINER_NAME,
      contentOffset: 0,
      contentLength: lastContent.length,
      content: displayContent,
    })

    const upgradeResult = await bridgeRef.textContainerUpgrade(upgradePayload)
    appendDebug(`[GLASS] upgrade result: ${String(upgradeResult)}`)

    if (upgradeResult === true) {
      lastContent = displayContent
      return
    }

    await createDisplayPage(displayContent, 'FALLBACK_RECREATE')
  } catch (error: any) {
    console.error(error)
    appendDebug(`[GLASS] upgrade error: ${error?.message || '未知错误'}`)
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null || intentionalStop) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    appendDebug('[WS] reconnecting...')
    connectWs()
  }, 1500)
}

function connectWs() {
  if (!WS_URL) {
    setAppState('error', '缺少 VITE_WS_URL 配置')
    return
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  setAppState('connecting', '正在连接服务...')
  appendDebug(`[WS] connecting -> ${WS_URL}`)

  ws = new WebSocket(WS_URL)
  ws.binaryType = 'arraybuffer'

  ws.onopen = async () => {
    wsReady = true
    clearReconnectTimer()
    appendDebug('[WS] connected')
    setAppState('ready', '服务已连接，准备录音')

    if (pendingAutoStart) {
      pendingAutoStart = false
      await startRecording('AUTO_AFTER_WS_READY')
    }
  }

  ws.onmessage = async (event) => {
    try {
      const text = typeof event.data === 'string' ? event.data : ''
      if (!text) return

      appendDebug(`[WS] recv: ${text}`)
      const data: WsMessage = JSON.parse(text)

      if (data.type === 'status') {
        const msg = String(data.message || '')
        setStatus(`后端状态：${msg}`)
        await upgradeDisplayText(
          buildGlassText({
            autoReply: msg,
          })
        )
        return
      }

      if (data.type === 'partial_text') {
        const msg = String(data.text || '')
        setAppState('recording', '识别中...')
        await upgradeDisplayText(
          buildGlassText({
            chinese: msg,
            autoReply: '识别中...',
          })
        )
        return
      }

      if (data.type === 'final_result') {
        const recognizedText = String(data.recognizedText || '')
        const translatedText = String(data.translatedText || '')
        const autoReply = String(data.autoReply || '')
        const meaningText = String(data.meaningText || data.chineseMeaning || '')
        const pronunciationText = String(
          data.pronunciationText || data.readingText || ''
        )

        setAppState('result', '翻译完成')
        await upgradeDisplayText(
          buildGlassText({
            vietnamese: translatedText,
            chinese: recognizedText,
            autoReply: autoReply || '...',
            meaning: meaningText || '...',
            pronunciation: pronunciationText || '...',
          })
        )

        if (AUTO_RESTART_AFTER_RESULT) {
          window.setTimeout(() => {
            void startRecording('AUTO_RESTART_AFTER_RESULT')
          }, 600)
        }
        return
      }

      if (data.type === 'error') {
        const msg = String(data.message || '')
        setAppState('error', `后端错误：${msg}`)
        await upgradeDisplayText(
          buildGlassText({
            autoReply: `错误: ${msg}`,
          })
        )
        return
      }
    } catch (error: any) {
      console.error(error)
      appendDebug(`[WS] onmessage error: ${error?.message || '未知错误'}`)
      setAppState('error', '消息解析异常')
    }
  }

  ws.onerror = (error) => {
    console.error(error)
    wsReady = false
    appendDebug('[WS] error')
    setAppState('error', '服务连接错误')
  }

  ws.onclose = () => {
    wsReady = false
    appendDebug('[WS] closed')
    if (isRecording) {
      isRecording = false
    }
    setAppState('error', '服务已断开，正在重连')
    scheduleReconnect()
  }
}

function sendStart() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket 未连接')
  }

  currentSessionId = `g2-${Date.now()}`
  const payload = {
    type: 'start',
    sessionId: currentSessionId,
    format: 'pcm_s16le',
    sampleRate: 16000,
    channels: 1,
    source: 'zh',
    target: 'vi',
  }

  ws.send(JSON.stringify(payload))
  appendDebug(`[WS] send start: ${JSON.stringify(payload)}`)
}

function sendStop() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'stop', sessionId: currentSessionId }))
  appendDebug('[WS] send stop')
}

function bindEvenHubEvents() {
  if (!bridgeRef || typeof bridgeRef.onEvenHubEvent !== 'function') {
    appendDebug('[EVENT] bridge.onEvenHubEvent 不存在')
    return
  }

  if (unsubscribeEvenHubEvent) {
    unsubscribeEvenHubEvent()
    unsubscribeEvenHubEvent = null
  }

  unsubscribeEvenHubEvent = bridgeRef.onEvenHubEvent((event: any) => {
    try {
      if (event?.audioEvent?.audioPcm) {
        const pcm = event.audioEvent.audioPcm as Uint8Array

        if (isRecording && ws && ws.readyState === WebSocket.OPEN) {
          const pcmBuffer = pcm.buffer.slice(
            pcm.byteOffset,
            pcm.byteOffset + pcm.byteLength
          ) as ArrayBuffer

          ws.send(pcmBuffer)
        }
      }
    } catch (error: any) {
      console.error(error)
      appendDebug(`[EVENT] error: ${error?.message || '未知错误'}`)
    }
  })

  appendDebug('[EVENT] onEvenHubEvent 已绑定')
}

async function startRecording(trigger = 'MANUAL_START') {
  if (!bridgeRef) return
  if (isRecording) return

  if (!pageCreated) {
    await createDisplayPage(lastContent, 'AUTO_INIT')
  }

  if (!wsReady) {
    pendingAutoStart = true
    connectWs()
    setAppState('connecting', '服务连接中，准备自动开始...')
    return
  }

  try {
    intentionalStop = false
    sendStart()
    const result = await bridgeRef.audioControl(true)
    appendDebug(`[REC] ${trigger} audioControl(true) => ${result}`)

    isRecording = true
    setAppState('recording', '录音中...')
    await upgradeDisplayText(
      buildGlassText({
        autoReply: '正在录音...',
      })
    )
  } catch (error: any) {
    console.error(error)
    appendDebug(`[REC] start error: ${error?.message || '未知错误'}`)
    setAppState('error', '开始录音失败')
  }
}

async function stopRecording(trigger = 'MANUAL_STOP') {
  if (!bridgeRef) return
  if (!isRecording) return

  try {
    intentionalStop = true
    const result = await bridgeRef.audioControl(false)
    appendDebug(`[REC] ${trigger} audioControl(false) => ${result}`)

    isRecording = false
    sendStop()
    setAppState('processing', '已停止录音，等待后端处理')
    await upgradeDisplayText(
      buildGlassText({
        autoReply: '处理中...',
      })
    )
  } catch (error: any) {
    console.error(error)
    appendDebug(`[REC] stop error: ${error?.message || '未知错误'}`)
    setAppState('error', '停止录音失败')
  }
}

async function restartRecording() {
  if (isRecording) {
    await stopRecording('RESTART_STOP')
  }
  window.setTimeout(() => {
    intentionalStop = false
    void startRecording('RESTART_START')
  }, 300)
}

async function main() {
  try {
    setAppState('booting', '等待 EvenAppBridge...')
    setDebug('正在等待 EvenAppBridge...')

    const bridge: any = await waitForEvenAppBridge()
    bridgeRef = bridge

    appendDebug(`bridge keys: ${Object.keys(bridge || {}).join(', ') || 'none'}`)
    appendDebug(`typeof createStartUpPageContainer: ${typeof bridge?.createStartUpPageContainer}`)
    appendDebug(`typeof textContainerUpgrade: ${typeof bridge?.textContainerUpgrade}`)
    appendDebug(`typeof audioControl: ${typeof bridge?.audioControl}`)
    appendDebug(`typeof onEvenHubEvent: ${typeof bridge?.onEvenHubEvent}`)

    await createDisplayPage(lastContent, 'AUTO_INIT')
    bindEvenHubEvents()
    connectWs()

    if (AUTO_START_ON_READY) {
      pendingAutoStart = true
    }
  } catch (error: any) {
    console.error(error)
    appendDebug(`error: ${error?.message || '未知错误'}`)
    setAppState('error', '初始化异常')
  }
}

document.querySelector<HTMLButtonElement>('#toggle-btn')?.addEventListener('click', async () => {
  if (appState === 'recording') {
    await stopRecording('TOGGLE_STOP')
    return
  }

  await startRecording('TOGGLE_START')
})

document.querySelector<HTMLButtonElement>('#restart-btn')?.addEventListener('click', async () => {
  await restartRecording()
})

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    if (isRecording) {
      await stopRecording('PAGE_HIDDEN')
    }
    return
  }

  if (!isRecording && AUTO_START_ON_READY && !intentionalStop) {
    await startRecording('PAGE_VISIBLE_AUTO_START')
  }
})

window.addEventListener('beforeunload', () => {
  try {
    if (bridgeRef && isRecording) {
      void bridgeRef.audioControl(false)
    }
    sendStop()
    unsubscribeEvenHubEvent?.()
    ws?.close()
  } catch {
    // noop
  }
})

main()