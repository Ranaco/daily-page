const API = 'https://api.telegram.org/bot'

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return t
}

export function ownerId(): string {
  const id = process.env.TELEGRAM_OWNER_ID
  if (!id) throw new Error('TELEGRAM_OWNER_ID is not set')
  return id
}

async function call(method: string, body: unknown) {
  const res = await fetch(`${API}${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown }
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`)
  return json.result
}

export type Button = { text: string; data: string }

function keyboard(rows: Button[][]) {
  return {
    inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))),
  }
}

export async function send(text: string, rows: Button[][] = []) {
  return call('sendMessage', {
    chat_id: ownerId(),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(rows.length ? { reply_markup: keyboard(rows) } : {}),
  })
}

export async function edit(chatId: number | string, messageId: number, text: string, rows: Button[][] = []) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(rows.length ? { reply_markup: keyboard(rows) } : {}),
  })
}

/** Telegram requires an answer to every callback query or the client spins. */
export async function answer(callbackId: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) })
}

export async function setWebhook(url: string, secret: string) {
  return call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
