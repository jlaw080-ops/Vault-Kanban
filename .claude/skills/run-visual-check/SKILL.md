---
name: run-visual-check
description: Use when Vault Kanban 앱을 실제로 구동해 UI를 육안 확인해야 할 때 — 문서 뷰(DocumentView)·렌더링·CSS 변경 후 검증, 스크린샷 요청, "앱 실행해서 확인해줘", visual check, screenshot. 테스트 통과만으로 최종 보증이 안 되는 렌더링 결과를 Playwright로 자동 확인한다.
---

# run-visual-check — 문서 뷰 육안 확인 자동화

Vault Kanban(Electron)을 Playwright `_electron`으로 실제 구동해 문서 뷰의
콜아웃 색상 바 / mermaid 렌더 / 인쇄 버튼 활성화 / Esc 닫기를 스크린샷과 함께 검증한다.
실행 중 settings.json을 스킬 동봉 테스트 볼트로 잠시 교체하므로 **실제 볼트는 건드리지 않는다**
(교체·복원은 드라이버가 try/finally로 자체 처리, 비정상 종료 시 다음 실행이 자가 복구).

## 사전 조건

1. **앱이 실행 중이면 안 된다** — settings.json을 스왑하므로 충돌한다. 확인:
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -match 'electron|vault' }
   ```
2. **프로덕션 빌드가 있어야 한다** (드라이버는 `out/`을 로드):
   ```bash
   npm run build
   ```

## 실행

playwright-core가 설치된 아무 폴더(스크래치패드 권장 — 프로젝트 의존성에 추가하지 말 것)에서:

```bash
mkdir -p <scratchpad>/vk-driver && cd <scratchpad>/vk-driver
npm init -y && npm install playwright-core --no-audit --no-fund
node "C:/Users/jlaw8/dev/Vault Kanban/.claude/skills/run-visual-check/driver.mjs"
```

- 앱 창이 화면에 잠깐 뜬다 (Windows 데스크톱 세션 — xvfb 불필요).
- 종료 시 JSON 계측 결과 + `RESULT: PASS|FAIL` 출력, 종료 코드 0/1.
- 스크린샷은 실행 폴더의 `shots/`에 저장: `00-board` `01-docview` `02-after-esc` (실패 시 `99-error`).
- **스크린샷을 반드시 Read로 열어 눈으로 볼 것** — PASS여도 레이아웃 깨짐은 계측이 못 잡는다.

## 검증 항목 (PASS 기준)

| 항목 | 기준 |
|---|---|
| mermaid | `.doc-sheet svg` 렌더됨 |
| 콜아웃 | note/warning/tip 3개, borderLeftColor 유색 |
| 인쇄 버튼 | mermaid settled 후 ENABLED |
| Esc | `.doc-modal` DOM에서 제거됨 |

## Gotchas (실측 — 우회하지 말 것)

- **ELECTRON_RUN_AS_NODE**: Claude Code/VSCode 터미널이 이 env를 물려주면 electron이
  일반 Node로 부팅돼 launch가 침묵 실패한다. 드라이버가 삭제하고 시작한다 (scripts/dev.mjs와 동일 사유).
- **카드 클릭은 좌표 클릭**: dnd-kit 카드는 `cursor-grab`이라 DOM 합성 `.click()`이
  핸들러에 닿지 않는다. 이 앱은 BrowserView 없는 단일 BrowserWindow라 `page.click('text=…')`
  좌표 클릭이 안전하고, 이것만 동작한다.
- **문서 보기 버튼은 DOM 클릭**: `[title^="문서 보기"]` — 아이콘 버튼이라 텍스트 셀렉터 불가.
- **settings.json 위치**: `%APPDATA%\vault-kanban\settings.json`. 백업 파일명
  `settings.json.bak-visual-check`가 남아 있으면 이전 실행이 죽은 것 — 드라이버가 시작 시 자가 복구한다.

## 확장

새 검증 항목(예: 이미지 임베드, 위키링크)은 `test-vault/문서뷰-육안확인.md`에 마크다운을 추가하고
driver.mjs의 계측·PASS 기준에 한 단계를 더하면 된다. 카드 제목을 바꾸면 `CARD_TITLE`도 같이 바꿀 것.
