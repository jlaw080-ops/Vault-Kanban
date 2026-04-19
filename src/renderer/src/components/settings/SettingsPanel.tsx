import { useState, useEffect } from 'react'
import { KeyRound, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useViewStore } from '../../stores/viewStore'

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (빠름, 저비용)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (균형)' }
]

export function SettingsPanel(): JSX.Element {
  const { pushToast } = useViewStore()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyExists, setKeyExists] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [model, setModel] = useState('claude-haiku-4-5-20251001')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.apiKey.exists().then(setKeyExists)
    window.api.apiKey.getModel().then(setModel)
  }, [])

  async function handleSaveKey(): Promise<void> {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    const result = await window.api.apiKey.set(apiKeyInput.trim())
    setSaving(false)
    if (result.ok) {
      setKeyExists(true)
      setApiKeyInput('')
      setTestStatus('idle')
      pushToast('API 키가 저장되었습니다.', 'success')
    } else {
      pushToast(result.error ?? 'API 키 저장 실패', 'error')
    }
  }

  async function handleTestKey(): Promise<void> {
    setTestStatus('loading')
    setTestError('')
    const result = await window.api.apiKey.test()
    if (result.ok) {
      setTestStatus('ok')
    } else {
      setTestStatus('error')
      setTestError(result.error ?? '알 수 없는 오류')
    }
  }

  async function handleModelChange(value: string): Promise<void> {
    setModel(value)
    await window.api.apiKey.setModel(value)
    pushToast('모델이 변경되었습니다.', 'success')
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-6">설정</h2>

      {/* AI 섹션 */}
      <section className="max-w-lg">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <KeyRound size={14} />
          AI 설정 (Anthropic Claude)
        </h3>

        <div className="space-y-4">
          {/* API 키 상태 */}
          {keyExists && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={12} />
              API 키가 저장되어 있습니다.
            </div>
          )}

          {/* API 키 입력 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              {keyExists ? 'API 키 교체' : 'API 키 입력'}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                placeholder="sk-ant-..."
                className="flex-1 text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim() || saving}
                className="text-xs px-3 py-2 rounded-md bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>

          {/* 키 테스트 */}
          {keyExists && (
            <div className="space-y-2">
              <button
                onClick={handleTestKey}
                disabled={testStatus === 'loading'}
                className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40"
              >
                {testStatus === 'loading' && <Loader2 size={12} className="animate-spin" />}
                {testStatus === 'ok' && <CheckCircle size={12} className="text-emerald-500" />}
                {testStatus === 'error' && <XCircle size={12} className="text-red-500" />}
                {testStatus === 'idle' && <KeyRound size={12} />}
                키 테스트
              </button>
              {testStatus === 'ok' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  API 키가 정상적으로 작동합니다.
                </p>
              )}
              {testStatus === 'error' && (
                <p className="text-xs text-red-600 dark:text-red-400">{testError}</p>
              )}
            </div>
          )}

          {/* 모델 선택 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              사용 모델
            </label>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Haiku: 빠르고 저렴, 간단한 분류에 적합 / Sonnet: 더 정확, 비용 높음
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
