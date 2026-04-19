#!/usr/bin/env bash
# tdd-guard.sh
# Write/Edit/str_replace 도구 호출 직전 실행.
# 구현 파일(.ts)을 수정하려 할 때 대응하는 .test.ts가 없으면 경고한다.
# 순수 함수 폴더(src/renderer/src/lib, src/main/utils)에만 적용.

set -euo pipefail

TARGET_PATH="${CLAUDE_TOOL_INPUT_PATH:-${CLAUDE_TOOL_INPUT:-}}"

# 대상 폴더인지 확인
case "$TARGET_PATH" in
  *src/renderer/src/lib/*|*src/main/utils/*)
    ;;
  *)
    # 대상이 아니면 통과
    exit 0
    ;;
esac

# .test.ts / .d.ts / 테스트 파일 자체는 스킵
case "$TARGET_PATH" in
  *.test.ts|*.test.tsx|*.d.ts|*.spec.ts)
    exit 0
    ;;
esac

# .ts 파일만 대상
if [[ "$TARGET_PATH" != *.ts ]]; then
  exit 0
fi

# 대응하는 테스트 파일 경로 계산
TEST_PATH="${TARGET_PATH%.ts}.test.ts"

if [[ ! -f "$TEST_PATH" ]]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "⚠️  TDD GUARD: 테스트 파일이 없습니다." >&2
  echo "" >&2
  echo "   구현 대상: $TARGET_PATH" >&2
  echo "   누락 테스트: $TEST_PATH" >&2
  echo "" >&2
  echo "   CLAUDE.md의 TDD CRITICAL 규칙에 따라" >&2
  echo "   테스트를 먼저 작성한 뒤 구현하세요." >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  # 차단하지 않고 경고만 (엄격 모드로 바꾸려면 exit 1)
  exit 0
fi

exit 0
