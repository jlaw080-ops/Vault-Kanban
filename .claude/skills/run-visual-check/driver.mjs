// Vault Kanban 문서 뷰 육안 확인 드라이버.
// 실행법은 같은 폴더 SKILL.md 참조. playwright-core 가 설치된 폴더에서 실행할 것.
import { createRequire } from 'node:module'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'))
let electron
try {
  ;({ _electron: electron } = requireFromCwd('playwright-core'))
} catch {
  console.error('playwright-core 미설치 — 현재 폴더에서 `npm install playwright-core` 후 재실행')
  process.exit(1)
}

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(SKILL_DIR, '..', '..', '..')
const TEST_VAULT = path.join(SKILL_DIR, 'test-vault')
const SETTINGS = path.join(process.env.APPDATA, 'vault-kanban', 'settings.json')
const BACKUP = SETTINGS + '.bak-visual-check'
const SHOT_DIR = path.join(process.cwd(), 'shots')
const CARD_TITLE = '문서뷰 육안확인'

if (!fs.existsSync(path.join(APP_DIR, 'out', 'main', 'index.js'))) {
  console.error('out/main/index.js 없음 — 프로젝트 루트에서 `npm run build` 먼저 실행')
  process.exit(1)
}
fs.mkdirSync(SHOT_DIR, { recursive: true })

// 이전 실행이 복원 전에 죽었으면 백업이 남아 있다 — 진짜 설정은 백업 쪽이므로 먼저 복구
if (fs.existsSync(BACKUP)) {
  fs.copyFileSync(BACKUP, SETTINGS)
  fs.rmSync(BACKUP)
  console.log('이전 실행의 백업 발견 → settings.json 복구 후 진행')
}

// 설정을 테스트 볼트로 교체 (실제 볼트 무접촉). finally 에서 반드시 복원된다.
fs.copyFileSync(SETTINGS, BACKUP)
const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))
settings.vaultPath = TEST_VAULT
settings.vaultName = 'test-vault'
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, '\t'))

// VSCode/Claude Code 터미널이 ELECTRON_RUN_AS_NODE 를 물려주면 electron 이 Node 로 부팅됨
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const results = {}
let app = null

try {
  app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [APP_DIR],
    env,
    timeout: 30_000
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 1) 보드에 테스트 카드가 뜰 때까지 대기
  await page.waitForFunction(
    (title) => document.body.innerText.includes(title),
    CARD_TITLE,
    { timeout: 30_000 }
  )
  await page.screenshot({ path: path.join(SHOT_DIR, '00-board.png') })

  // 2) 카드 클릭 → NoteEditor. DOM 합성 click 은 dnd-kit 카드(cursor-grab)에서
  //    핸들러에 닿지 않는다 — 단일 BrowserWindow 앱이므로 실제 좌표 클릭을 쓴다.
  await page.click(`text=${CARD_TITLE}`)

  // 3) 문서 보기 버튼 → 모달
  await page.waitForSelector('[title^="문서 보기"]', { timeout: 10_000 })
  await page.evaluate(() => document.querySelector('[title^="문서 보기"]').click())
  await page.waitForSelector('.doc-sheet', { timeout: 10_000 })

  // 4) mermaid svg 렌더
  try {
    await page.waitForSelector('.doc-sheet svg', { timeout: 20_000 })
    results.mermaidSvg = 'RENDERED'
  } catch {
    results.mermaidSvg = 'TIMEOUT'
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SHOT_DIR, '01-docview.png') })

  // 5) 콜아웃 색상 바 계측
  results.callouts = await page.evaluate(() =>
    [...document.querySelectorAll('.doc-body blockquote[data-callout]')].map((el) => ({
      type: el.getAttribute('data-callout'),
      borderLeftColor: getComputedStyle(el).borderLeftColor
    }))
  )

  // 6) 인쇄 버튼 (mermaid settled 후 활성화되어야 함)
  results.printButton = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('인쇄'))
    return b ? (b.disabled ? 'DISABLED' : 'ENABLED') : 'NOT_FOUND'
  })

  // 7) Esc → 모달 닫힘
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  results.escClose = await page.evaluate(() =>
    document.querySelector('.doc-modal') ? 'STILL_OPEN' : 'CLOSED'
  )
  await page.screenshot({ path: path.join(SHOT_DIR, '02-after-esc.png') })
} catch (e) {
  console.error('DRIVER_ERROR:', e.message)
  results.error = e.message
  try {
    const page = await app?.firstWindow()
    await page?.screenshot({ path: path.join(SHOT_DIR, '99-error.png') })
  } catch {
    /* 스크린샷 실패는 무시 */
  }
} finally {
  await app?.close().catch(() => {})
  fs.copyFileSync(BACKUP, SETTINGS)
  fs.rmSync(BACKUP)
}

const hasColoredBar = (c) => c.borderLeftColor && c.borderLeftColor !== 'rgba(0, 0, 0, 0)'
const pass =
  !results.error &&
  results.mermaidSvg === 'RENDERED' &&
  results.callouts?.length === 3 &&
  results.callouts.every(hasColoredBar) &&
  results.printButton === 'ENABLED' &&
  results.escClose === 'CLOSED'

console.log(JSON.stringify(results, null, 2))
console.log('스크린샷:', SHOT_DIR)
console.log('RESULT:', pass ? 'PASS' : 'FAIL')
process.exitCode = pass ? 0 : 1
