import { useState, useEffect } from 'react'
import {
  KeyRound,
  CheckCircle,
  XCircle,
  Loader2,
  FolderOpen,
  Columns,
  Clock,
  LayoutGrid,
  FileText,
  Info,
  Plus,
  Trash2,
  GripVertical
} from 'lucide-react'
import { useViewStore } from '../../stores/viewStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ColumnConfig } from '@renderer/types'

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (빠름, 저비용)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (균형)' }
]

const GROUPING_OPTIONS = [
  { value: 'status', label: '상태별' },
  { value: 'tag', label: '태그별' },
  { value: 'folder', label: '폴더별' },
  { value: 'project', label: '프로젝트별' }
]

const SORT_OPTIONS = [
  { value: 'modifiedDesc', label: '수정일 최신순' },
  { value: 'modifiedAsc', label: '수정일 오래된순' },
  { value: 'createdDesc', label: '생성일 최신순' },
  { value: 'createdAsc', label: '생성일 오래된순' },
  { value: 'titleAsc', label: '제목 오름차순' },
  { value: 'dueAsc', label: '기한 가까운순' }
]

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }): JSX.Element {
  return (
    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
      {icon}
      {label}
    </h3>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400'

const selectCls =
  'text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400'

export function SettingsPanel(): JSX.Element {
  const { pushToast } = useViewStore()
  const { settings, load, update } = useSettingsStore()

  // AI section state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keyExists, setKeyExists] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)

  // Vault section local state
  const [vaultName, setVaultName] = useState('')
  const [excludedInput, setExcludedInput] = useState('')

  // Status columns local state
  const [columns, setColumns] = useState<ColumnConfig[]>([])
  const [statusFieldName, setStatusFieldName] = useState('status')

  // Version info
  const [appVersion] = useState('')

  useEffect(() => {
    load().then((s) => {
      setVaultName(s.vaultName)
      setColumns(s.statusColumns)
      setStatusFieldName(s.statusFieldName)
    })
    window.api.apiKey.exists().then(setKeyExists)
    window.api.apiKey.getModel().then(() => {})
  }, [])

  // ── Vault handlers ────────────────────────────────────────────
  async function handleChangeVault(): Promise<void> {
    const selected = await window.api.vault.select()
    if (!selected) return
    const name = selected.split(/[\\/]/).pop() ?? selected
    await update('vaultPath', selected)
    await update('vaultName', name)
    setVaultName(name)
    pushToast('Vault 경로가 변경되었습니다.', 'success')
  }

  async function handleVaultNameBlur(): Promise<void> {
    await update('vaultName', vaultName)
  }

  function addExcludedFolder(): void {
    const trimmed = excludedInput.trim()
    if (!trimmed || !settings) return
    const next = [...(settings.excludedFolders ?? []), trimmed]
    update('excludedFolders', next)
    setExcludedInput('')
  }

  function removeExcludedFolder(folder: string): void {
    if (!settings) return
    const next = (settings.excludedFolders ?? []).filter((f) => f !== folder)
    update('excludedFolders', next)
  }

  // ── Status columns handlers ───────────────────────────────────
  function updateColumn(idx: number, patch: Partial<ColumnConfig>): void {
    setColumns((prev) => {
      const next = prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
      update('statusColumns', next)
      return next
    })
  }

  function addColumn(): void {
    const newCol: ColumnConfig = { name: '새 컬럼', wipLimit: null, policy: '' }
    setColumns((prev) => {
      const next = [...prev, newCol]
      update('statusColumns', next)
      return next
    })
  }

  function removeColumn(idx: number): void {
    setColumns((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      update('statusColumns', next)
      return next
    })
  }

  async function handleStatusFieldBlur(): Promise<void> {
    await update('statusFieldName', statusFieldName)
  }

  // ── AI handlers ───────────────────────────────────────────────
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
    await window.api.apiKey.setModel(value)
    await update('anthropicModel', value)
    pushToast('모델이 변경되었습니다.', 'success')
  }

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-6">설정</h2>

      <div className="max-w-lg space-y-8">
        {/* ── Vault ──────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<FolderOpen size={14} />} label="Vault" />
          <div className="space-y-4">
            <Field label="현재 경로">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={settings.vaultPath || '선택되지 않음'}
                  className={`${inputCls} flex-1 text-slate-500 cursor-default`}
                />
                <button
                  onClick={handleChangeVault}
                  className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  변경
                </button>
              </div>
            </Field>

            <Field label="Vault 이름">
              <input
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                onBlur={handleVaultNameBlur}
                className={inputCls}
                placeholder="My Vault"
              />
            </Field>

            <Field label="제외 폴더">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(settings.excludedFolders ?? []).map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    {f}
                    <button
                      onClick={() => removeExcludedFolder(f)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <XCircle size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={excludedInput}
                  onChange={(e) => setExcludedInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExcludedFolder()}
                  placeholder=".obsidian"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={addExcludedFolder}
                  className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Plus size={12} />
                </button>
              </div>
            </Field>
          </div>
        </section>

        {/* ── 상태 필드 ───────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Columns size={14} />} label="상태 필드 및 컬럼" />
          <div className="space-y-4">
            <Field label="상태 필드명 (frontmatter key)">
              <input
                value={statusFieldName}
                onChange={(e) => setStatusFieldName(e.target.value)}
                onBlur={handleStatusFieldBlur}
                className={inputCls}
                placeholder="status"
              />
              <p className="text-xs text-slate-400 mt-1">
                노트 frontmatter에서 읽을 필드명 (예: status, 상태)
              </p>
            </Field>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  컬럼 목록
                </span>
                <button
                  onClick={addColumn}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                >
                  <Plus size={10} />
                  추가
                </button>
              </div>
              <div className="space-y-2">
                {columns.map((col, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 border border-slate-100 dark:border-slate-800 rounded-md"
                  >
                    <GripVertical
                      size={12}
                      className="text-slate-300 dark:text-slate-600 flex-shrink-0"
                    />
                    <input
                      value={col.name}
                      onChange={(e) => updateColumn(idx, { name: e.target.value })}
                      className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="컬럼명"
                    />
                    <input
                      type="number"
                      min={1}
                      value={col.wipLimit ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateColumn(idx, { wipLimit: v === '' ? null : Math.max(1, parseInt(v)) })
                      }}
                      className="w-16 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="WIP"
                    />
                    <button
                      onClick={() => removeColumn(idx)}
                      className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">WIP 칸이 비어있으면 제한 없음</p>
            </div>
          </div>
        </section>

        {/* ── 체류시간 경고 ────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Clock size={14} />} label="체류시간 경고" />
          <div className="flex gap-4">
            <Field label="노란 경고 (일)">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.stayTimeWarnings?.yellow ?? 7}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  update('stayTimeWarnings', { ...settings.stayTimeWarnings, yellow: v })
                }}
                className={`${inputCls} w-24`}
              />
            </Field>
            <Field label="빨간 경고 (일)">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.stayTimeWarnings?.red ?? 14}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 1)
                  update('stayTimeWarnings', { ...settings.stayTimeWarnings, red: v })
                }}
                className={`${inputCls} w-24`}
              />
            </Field>
          </div>
        </section>

        {/* ── 기본 뷰 ─────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<LayoutGrid size={14} />} label="기본 뷰" />
          <div className="flex gap-4">
            <Field label="기본 그룹핑">
              <select
                value={settings.defaultGrouping}
                onChange={(e) =>
                  update(
                    'defaultGrouping',
                    e.target.value as 'status' | 'tag' | 'folder' | 'project'
                  )
                }
                className={selectCls}
              >
                {GROUPING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="기본 정렬">
              <select
                value={settings.defaultSort}
                onChange={(e) => update('defaultSort', e.target.value as Settings['defaultSort'])}
                className={selectCls}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* ── 에디터 ──────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<FileText size={14} />} label="에디터" />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="auto-save"
                checked={settings.editorAutoSave?.enabled ?? true}
                onChange={(e) =>
                  update('editorAutoSave', {
                    ...(settings.editorAutoSave ?? { enabled: true, idleSeconds: 2 }),
                    enabled: e.target.checked
                  })
                }
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <label htmlFor="auto-save" className="text-xs text-slate-700 dark:text-slate-300">
                자동 저장 사용
              </label>
            </div>
            {(settings.editorAutoSave?.enabled ?? true) && (
              <Field label="자동 저장 대기 시간 (초)">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.editorAutoSave?.idleSeconds ?? 2}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 2))
                    update('editorAutoSave', {
                      ...(settings.editorAutoSave ?? { enabled: true, idleSeconds: 2 }),
                      idleSeconds: v
                    })
                  }}
                  className={`${inputCls} w-24`}
                />
                <p className="text-xs text-slate-400 mt-1">
                  입력 중단 후 이 시간이 지나면 자동 저장됩니다.
                </p>
              </Field>
            )}
            <Field label="테마">
              <select
                value={settings.theme ?? 'system'}
                onChange={(e) => update('theme', e.target.value as 'system' | 'light' | 'dark')}
                className={selectCls}
              >
                <option value="system">시스템 따름</option>
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </Field>
          </div>
        </section>

        {/* ── AI (Anthropic) ───────────────────────────────────── */}
        <section>
          <SectionHeader icon={<KeyRound size={14} />} label="AI 설정 (Anthropic Claude)" />
          <div className="space-y-4">
            {keyExists && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={12} />
                API 키가 저장되어 있습니다.
              </div>
            )}

            <Field label={keyExists ? 'API 키 교체' : 'API 키 입력'}>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                  placeholder="sk-ant-..."
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={handleSaveKey}
                  disabled={!apiKeyInput.trim() || saving}
                  className="text-xs px-3 py-2 rounded-md bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </Field>

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
                  {testStatus === 'idle' && <KeyRound size={12} />}키 테스트
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

            <Field label="사용 모델">
              <select
                value={settings.anthropicModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className={`${selectCls} w-full`}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Haiku: 빠르고 저렴, 간단한 분류에 적합 / Sonnet: 더 정확, 비용 높음
              </p>
            </Field>
          </div>
        </section>

        {/* ── 정보 ────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={<Info size={14} />} label="정보" />
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <span>버전</span>
              <span className="font-mono">{appVersion || '0.1.0'}</span>
            </div>
            <div className="flex justify-between">
              <span>GitHub</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.open('https://github.com/your-org/vault-kanban', '_blank')
                }}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
              >
                vault-kanban
              </a>
            </div>
            <div className="flex justify-between">
              <span>라이선스</span>
              <span>MIT</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

type Settings = import('@renderer/types').Settings
