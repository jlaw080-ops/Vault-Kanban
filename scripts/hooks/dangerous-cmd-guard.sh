#!/usr/bin/env bash
# dangerous-cmd-guard.sh
# Bash 실행 직전 호출되어, 위험한 명령어 패턴이 있으면 차단한다.
# Claude Code는 환경변수 CLAUDE_TOOL_INPUT으로 실행할 명령을 전달한다.

set -euo pipefail

CMD="${CLAUDE_TOOL_INPUT:-}"

# 차단 패턴 (정규식 | OR)
BLOCKED_PATTERNS=(
  'rm[[:space:]]+-rf[[:space:]]+/'           # rm -rf /  (루트 삭제)
  'rm[[:space:]]+-rf[[:space:]]+~'           # rm -rf ~  (홈 삭제)
  'rm[[:space:]]+-rf[[:space:]]+\*'          # rm -rf *
  'git[[:space:]]+push[[:space:]]+.*--force' # force push
  'git[[:space:]]+push[[:space:]]+.*-f[[:space:]]' # git push -f
  'git[[:space:]]+reset[[:space:]]+--hard'   # hard reset (작업 내용 소실)
  'DROP[[:space:]]+TABLE'                    # SQL 파괴
  'DROP[[:space:]]+DATABASE'
  '>[[:space:]]*/dev/sd[a-z]'                # 디스크 덮어쓰기
  'mkfs'                                     # 파일시스템 포맷
  ':(){[[:space:]]*:|:&[[:space:]]*};:'      # fork bomb
  'chmod[[:space:]]+-R[[:space:]]+777[[:space:]]+/' # 전체 777
)

for pat in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qE "$pat"; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "🛑 BLOCKED: 위험한 명령어가 감지되었습니다." >&2
    echo "   패턴: $pat" >&2
    echo "   명령: ${CMD:0:200}" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "" >&2
    echo "해결 방법:" >&2
    echo "  1) 정말 필요하면 사용자가 직접 터미널에서 실행" >&2
    echo "  2) 더 안전한 대안 사용 (예: rm -i, git restore)" >&2
    exit 1
  fi
done

# 민감 파일 접근 감지 (경고만, 차단하지 않음)
SENSITIVE_PATTERNS=(
  '\.ssh/id_'
  '\.env\.local'
  'credentials\.json'
  '~/.aws/'
  'safeStorage'
)
for pat in "${SENSITIVE_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qE "$pat"; then
    echo "⚠️  WARN: 민감한 경로/키워드 접근 감지 ($pat)" >&2
    echo "   필요한 경우에만 계속 진행하세요." >&2
  fi
done

exit 0
