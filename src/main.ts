import './style.css'
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="page" style="max-width: 760px; margin: 0 auto; padding: 32px 20px;">
    <h1 style="font-size: 48px; margin-bottom: 12px;">Even G2 翻译助手</h1>
    <p class="status" style="font-size: 18px; color: #2e7d32; font-weight: 700; margin-bottom: 20px;">
      当前状态：手机端演示模式
    </p>
    <p style="font-size: 18px; margin-bottom: 24px;">
      先输入中文句子，再点击“翻译成越南语”。
    </p>

    <div style="display: flex; flex-direction: column; gap: 12px;">
      <label for="source-text" style="font-weight: 700; font-size: 18px;">中文输入</label>
      <textarea
        id="source-text"
        rows="4"
        style="width: 100%; font-size: 18px; padding: 14px; border: 1px solid #bbb; border-radius: 8px;"
        placeholder="例如：你好，今天晚上你有空吗？"
      >你好，今天晚上你有空吗？</textarea>
    </div>

    <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
      <button id="translate-btn" style="padding: 12px 20px; font-size: 16px;">翻译成越南语</button>
      <button id="sample-btn" style="padding: 12px 20px; font-size: 16px;">加载示例句子</button>
      <button id="clear-btn" style="padding: 12px 20px; font-size: 16px;">清空</button>
    </div>

    <div style="margin-top: 28px;">
      <p style="font-weight: 700; margin-bottom: 8px;">状态</p>
      <p id="sdk-result" style="font-size: 18px;">等待操作...</p>
    </div>

    <div style="margin-top: 24px;">
      <p style="font-weight: 700; margin-bottom: 8px;">越南语结果</p>
      <div
        id="target-text"
        style="min-height: 80px; background: #f5f5f5; border-radius: 10px; padding: 16px; font-size: 22px; line-height: 1.6;"
      >翻译结果会显示在这里</div>
    </div>
  </div>
`

let cachedBridge: any = null

async function getBridgeSafe() {
  try {
    if (cachedBridge) return cachedBridge
    cachedBridge = await waitForEvenAppBridge()
    console.log('Bridge 已连接：', cachedBridge)
    return cachedBridge
  } catch (error) {
    console.warn('Bridge 不可用，但不影响手机端演示：', error)
    return null
  }
}

function setStatus(text: string) {
  const el = document.querySelector<HTMLParagraphElement>('#sdk-result')
  if (el) el.textContent = text
}

function setResult(text: string) {
  const el = document.querySelector<HTMLDivElement>('#target-text')
  if (el) el.textContent = text
}

function fakeTranslateZhToVi(input: string) {
  const text = input.trim()

  const dictionary: Record<string, string> = {
    '你好': 'Xin chào',
    '你好，今天晚上你有空吗？': 'Xin chào, tối nay bạn có rảnh không?',
    '今天晚上你有空吗？': 'Tối nay bạn có rảnh không?',
    '我现在在测试翻译功能': 'Tôi đang kiểm tra chức năng dịch',
    '请稍等一下': 'Vui lòng chờ một chút',
    '谢谢': 'Cảm ơn',
    '我要去吃饭': 'Tôi đi ăn đây',
    '今天天气很好': 'Hôm nay thời tiết rất đẹp',
    '可以开始了吗？': 'Có thể bắt đầu được chưa?',
    '这个翻译插件已经安装成功': 'Plugin dịch này đã được cài đặt thành công'
  }

  if (dictionary[text]) return dictionary[text]

  if (text.includes('你好')) {
    return 'Xin chào'
  }

  if (text.includes('谢谢')) {
    return 'Cảm ơn'
  }

  return `【演示翻译】${text} → bản dịch tiếng Việt`
}

async function translateNow() {
  const textarea = document.querySelector<HTMLTextAreaElement>('#source-text')
  const input = textarea?.value ?? ''

  if (!input.trim()) {
    setStatus('请输入中文内容')
    setResult('翻译结果会显示在这里')
    return
  }

  setStatus('正在连接插件环境...')
  await getBridgeSafe()

  setStatus('正在请求线上翻译接口...')

  try {
    const resp = await fetch('https://vn-translator-api.onrender.com/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: input })
    })

    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      throw new Error(data?.error || '翻译接口失败')
    }

    setResult(data.translatedText || '')
    setStatus('翻译完成')
  } catch (error) {
    console.error(error)
    setStatus('翻译失败')
    setResult('请求线上接口失败，请检查 Render 服务是否在线')
  }
}

function loadSample() {
  const textarea = document.querySelector<HTMLTextAreaElement>('#source-text')
  if (textarea) {
    textarea.value = '我现在在测试翻译功能'
  }
  setStatus('已加载示例句子')
  setResult('翻译结果会显示在这里')
}

function clearAll() {
  const textarea = document.querySelector<HTMLTextAreaElement>('#source-text')
  if (textarea) {
    textarea.value = ''
  }
  setStatus('已清空')
  setResult('翻译结果会显示在这里')
}

document.getElementById('translate-btn')?.addEventListener('click', translateNow)
document.getElementById('sample-btn')?.addEventListener('click', loadSample)
document.getElementById('clear-btn')?.addEventListener('click', clearAll)