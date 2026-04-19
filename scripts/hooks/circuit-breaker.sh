#!/usr/bin/env bash
# circuit-breaker.sh
# 같은 에러 메시지가 60초 안에 5회 반복되면 경고한다.
# "AI가 같은 실수를 반복하고 있다" 신호.

set -euo pipefail

LOG_DIR="${TMPDIR:-/tmp}/harness-circuit"
mkdir -p "$LOG_DIR"

OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
if [[ -z "$OUTPUT" ]]; then
  exit 0
fi

# 에러 시그니처 추출 (첫 에러 라인만)
SIGNATURE=$(echo "$OUTPUT" | grep -iE "error|fail|exception" | head -1 | md5sum 2>/dev/null | awk '{print $1}' || true)
if [[ -z "$SIGNATURE" ]]; then
  exit 0
fi

LOG_FILE="$LOG_DIR/${SIGNATURE}.log"
NOW=$(date +%s)

# 60초 이내 타임스탬프만 유지
if [[ -f "$LOG_FILE" ]]; then
  awk -v now="$NOW" 'now - $1 < 60' "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
echo "$NOW" >> "$LOG_FILE"

COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')

if [[ "$COUNT" -ge 5 ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "🔁 CIRCUIT BREAKER: 같은 에러가 60초 내 ${COUNT}회 발생했습니다." >&2
  echo "" >&2
  echo "   현재 접근법이 작동하지 않고 있을 가능성이 높습니다." >&2
  echo "   전략을 바꾸세요:" >&2
  echo "   • 로그 전체를 다시 읽고 근본 원인 분석" >&2
  echo "   • 관련 문서(docs/, CLAUDE.md) 재확인" >&2
  echo "   • 필요 시 사용자에게 질문" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  # 카운터 리셋 (반복 경고 방지)
  rm -f "$LOG_FILE"
fi

exit 0
