import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Check, X, AlertTriangle, RefreshCw } from 'lucide-react'
import { scanStatusValues, suggestMapping } from '../../lib/statusMigration'
import { useVaultStore } from '../../stores/vaultStore'
import { useViewStore } from '../../stores/viewStore'
import type { Note } from '@renderer/types'

type MappingValue = '백로그' | '예정' | '진행중' | '검토' | '완료' | 'skip'
const STANDARD: MappingValue[] = ['백로그', '예정', '진행중', '검토', '완료', 'skip']
const STANDARD_LABELS: Record<MappingValue, string> = {
  백로그: '백로그',
  예정: '예정',
  진행중: '진행중',
  검토: '검토',
  완료: '완료',
  skip: '건너뜀 (변경 안 함)'
}

type Step = 'welcome' | 'scan' | 'map' | 'review' | 'execute' | 'done'

interface ScanEntry {
  value: string | null
  count: number
  suggested: MappingValue | 'ask'
}

interface Props {
  onClose: () => void
}

export function StatusMigrationWizard({ onClose }: Props): JSX.Element {
  const { notes, vaultPath } = useVaultStore()
  const { pushToast } = useViewStore()
  const [step, setStep] = useState<Step>('welcome')
  const [scanEntries, setScanEntries] = useState<ScanEntry[]>([])
  const [mapping, setMapping] = useState<Map<string | null, MappingValue>>(new Map())
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<{ migrated: number; errors: string[] } | null>(null)

  function runScan() {
    const counts = scanStatusValues(notes as Note[], 'status')
    const entries: ScanEntry[] = []
    counts.forEach((count, value) => {
      const raw = value as string | null
      const suggested = suggestMapping(raw)
      entries.push({ value: raw, count, suggested })
    })
    entries.sort((a, b) => b.count - a.count)
    setScanEntries(entries)

    const initial = new Map<string | null, MappingValue>()
    for (const e of entries) {
      if (e.suggested !== 'ask') {
        initial.set(e.value, e.suggested === 'skip' ? 'skip' : (e.suggested as MappingValue))
      }
    }
    setMapping(initial)
  }

  useEffect(() => {
    if (step === 'scan') runScan()
  }, [step])

  const unmapped = scanEntries.filter((e) => !mapping.has(e.value))
  const willChange = scanEntries.filter((e) => {
    const m = mapping.get(e.value)
    return m && m !== 'skip' && m !== e.value
  })

  async function handleExecute() {
    if (!vaultPath) return
    setExecuting(true)
    try {
      const entries: Array<[string | null, string | 'skip']> = []
      mapping.forEach((val, key) => entries.push([key, val]))
      const settings = await window.api.settings.getAll()
      const res = await window.api.migration.execute(
        vaultPath,
        entries,
        settings.excludedFolders ?? []
      )
      setResult({ migrated: res.migrated, errors: res.errors })
      setStep('done')
    } catch (err) {
      pushToast(`마이그레이션 실패: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setExecuting(false)
    }
  }

  const displayLabel = (value: string | null) =>
    value === null || value === '' ? '(없음 / 빈 값)' : value

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Status 마이그레이션
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 dark:border-slate-800">
          {(['welcome', 'scan', 'map', 'review', 'execute', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-medium ${
                  step === s
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : ['welcome', 'scan', 'map', 'review', 'execute', 'done'].indexOf(step) > i
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {['welcome', 'scan', 'map', 'review', 'execute', 'done'].indexOf(step) > i ? (
                  <Check size={10} />
                ) : (
                  i + 1
                )}
              </div>
              {i < 5 && <div className="w-4 h-px bg-slate-200 dark:bg-slate-700" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'welcome' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                vault 내 노트의 <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">status</code> 필드 값을
                표준 5가지 값으로 일괄 변환합니다.
              </p>
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  실행 전 <strong>.vault-backup/</strong> 폴더에 자동으로 백업을 생성합니다.
                  마이그레이션 실패 시 설정에서 복원할 수 있습니다.
                </p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                표준 값: 백로그 · 예정 · 진행중 · 검토 · 완료
              </p>
            </div>
          )}

          {step === 'scan' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {notes.length}개 노트에서 발견된 status 값:
              </p>
              {scanEntries.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">status 값 없음</p>
              )}
              {scanEntries.map((e) => (
                <div
                  key={String(e.value)}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800"
                >
                  <span className="font-mono text-slate-800 dark:text-slate-200">{displayLabel(e.value)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{e.count}개</span>
                    {e.suggested === 'ask' ? (
                      <span className="text-amber-600 dark:text-amber-400">매핑 필요</span>
                    ) : e.suggested === 'skip' ? (
                      <span className="text-slate-400">건너뜀</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">→ {e.suggested}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-3">
              {scanEntries.length === 0 && (
                <p className="text-sm text-slate-500">매핑할 항목 없음</p>
              )}
              {scanEntries.map((e) => (
                <div key={String(e.value)} className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <span className="font-mono">{displayLabel(e.value)}</span>
                    <span className="text-slate-400 font-normal">({e.count}개)</span>
                    {e.suggested === 'ask' && !mapping.has(e.value) && (
                      <span className="text-amber-500 text-[10px]">*</span>
                    )}
                  </label>
                  <select
                    value={mapping.get(e.value) ?? ''}
                    onChange={(ev) => {
                      const val = ev.target.value as MappingValue | ''
                      setMapping((prev) => {
                        const next = new Map(prev)
                        if (val === '') next.delete(e.value)
                        else next.set(e.value, val)
                        return next
                      })
                    }}
                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- 선택 --</option>
                    {STANDARD.map((s) => (
                      <option key={s} value={s}>
                        {STANDARD_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                아래 변환이 적용됩니다. 총 <strong>{willChange.reduce((a, e) => a + e.count, 0)}</strong>개 노트가 변경됩니다.
              </p>
              {willChange.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">변경할 항목 없음 (모두 건너뜀 또는 이미 표준값)</p>
              )}
              {willChange.map((e) => (
                <div key={String(e.value)} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-600 dark:text-slate-400">{displayLabel(e.value)}</span>
                  <ArrowRight size={12} className="text-slate-400 flex-shrink-0" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{mapping.get(e.value)}</span>
                  <span className="text-slate-400 ml-auto">{e.count}개</span>
                </div>
              ))}
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs text-slate-500 dark:text-slate-400">
                실행 전 자동 백업 생성 후 진행합니다.
              </div>
            </div>
          )}

          {step === 'execute' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              {executing ? (
                <>
                  <RefreshCw size={24} className="animate-spin text-slate-400" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">마이그레이션 실행 중…</p>
                </>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">실행 준비 완료</p>
              )}
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-emerald-500" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  마이그레이션 완료
                </p>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {result.migrated}개 노트의 status가 변경되었습니다.
              </p>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">오류 ({result.errors.length}건):</p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-[10px] font-mono text-red-600 dark:text-red-400 truncate">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {step === 'done' ? '닫기' : '취소'}
          </button>

          <div className="flex items-center gap-2">
            {step !== 'welcome' && step !== 'done' && (
              <button
                onClick={() => {
                  const order: Step[] = ['welcome', 'scan', 'map', 'review', 'execute', 'done']
                  const idx = order.indexOf(step)
                  if (idx > 0) setStep(order[idx - 1])
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeft size={12} />
                이전
              </button>
            )}

            {step !== 'done' && step !== 'execute' && (
              <button
                onClick={() => {
                  const order: Step[] = ['welcome', 'scan', 'map', 'review', 'execute', 'done']
                  const idx = order.indexOf(step)
                  if (step === 'map' && unmapped.length > 0) {
                    pushToast('모든 status 값의 매핑을 선택해주세요.', 'info')
                    return
                  }
                  setStep(order[idx + 1])
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300"
              >
                {step === 'review' ? '실행' : '다음'}
                <ArrowRight size={12} />
              </button>
            )}

            {step === 'execute' && (
              <button
                onClick={handleExecute}
                disabled={executing}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                마이그레이션 실행
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
