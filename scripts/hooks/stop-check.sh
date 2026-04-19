#!/usr/bin/env bash
# stop-check.sh
# Claude의 응답이 끝날 때마다 린트+빌드+테스트를 자동 실행한다.
# 실패하면 Claude가 다시 확인하고 수정하도록 유도.

set -uo pipefail

# package.json이 없으면 (프로젝트 초기화 전) 스킵
if [[ ! -f "package.json" ]]; then
  exit 0
fi

# node_modules가 없으면 (의존성 설치 전) 스킵
if [[ ! -d "node_modules" ]]; then
  exit 0
fi

echo ""
echo "════════════════════════════════════════"
echo "  Stop Hook: 자동 검증 실행"
echo "════════════════════════════════════════"

FAILED=0

run_check() {
  local name="$1"
  shift
  echo ""
  echo "▶ $name"
  if "$@" > /tmp/stop-check-${name}.log 2>&1; then
    echo "  ✓ $name 통과"
  else
    echo "  ✗ $name 실패 — 마지막 30줄:"
    tail -30 /tmp/stop-check-${name}.log | sed 's/^/    /'
    FAILED=1
  fi
}

# lint 스크립트가 있는지 확인
if grep -q '"lint"' package.json; then
  run_check "lint" npm run lint --silent
fi

# test 스크립트가 있는지 확인
if grep -q '"test"' package.json; then
  run_check "test" npm run test --silent -- --run
fi

# build는 오래 걸려 선택적으로 활성화 (환경변수 HARNESS_FULL_CHECK=1 시)
if [[ "${HARNESS_FULL_CHECK:-0}" == "1" ]] && grep -q '"build"' package.json; then
  run_check "build" npm run build --silent
fi

echo "════════════════════════════════════════"
if [[ $FAILED -eq 1 ]]; then
  echo "  ❌ 자동 검증 실패. 위 로그를 확인하고 수정해주세요."
  exit 1
fi
echo "  ✅ 자동 검증 통과"
exit 0
