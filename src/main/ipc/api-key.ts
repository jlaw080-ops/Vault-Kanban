import { ipcMain, safeStorage } from 'electron'
import Store from 'electron-store'

interface ApiKeyStore {
  encryptedApiKey?: string
  anthropicModel?: string
}

let keyStore: Store<ApiKeyStore> | null = null

function getKeyStore(): Store<ApiKeyStore> {
  if (!keyStore) {
    keyStore = new Store<ApiKeyStore>({ name: 'api-keys' })
  }
  return keyStore
}

// Internal only — never export or expose via IPC
function loadApiKeyDecrypted(): string | null {
  const stored = getKeyStore().get('encryptedApiKey')
  if (!stored) return null
  try {
    const buf = Buffer.from(stored, 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

export { loadApiKeyDecrypted }

export function registerApiKeyHandlers(): void {
  ipcMain.handle('apiKey:set', (_event, plain: string): { ok: boolean; error?: string } => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: '시스템 키체인을 사용할 수 없습니다.' }
      }
      const encrypted = safeStorage.encryptString(plain)
      getKeyStore().set('encryptedApiKey', encrypted.toString('base64'))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('apiKey:exists', (): boolean => {
    return !!getKeyStore().get('encryptedApiKey')
  })

  ipcMain.handle('apiKey:test', async (): Promise<{ ok: boolean; error?: string }> => {
    const key = loadApiKeyDecrypted()
    if (!key) return { ok: false, error: 'API 키가 설정되지 않았습니다.' }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }]
      })
      return { ok: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('401') || msg.includes('authentication')) {
        return { ok: false, error: '키가 잘못되었습니다. 재발급 후 다시 시도하세요.' }
      }
      if (msg.includes('429')) {
        return { ok: false, error: '크레딧을 충전하거나 잠시 후 시도하세요.' }
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
        return { ok: false, error: '네트워크 연결을 확인하세요.' }
      }
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('apiKey:setModel', (_event, model: string): void => {
    getKeyStore().set('anthropicModel', model)
  })

  ipcMain.handle('apiKey:getModel', (): string => {
    return getKeyStore().get('anthropicModel') ?? 'claude-haiku-4-5-20251001'
  })
}
