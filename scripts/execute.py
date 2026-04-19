#!/usr/bin/env python3
"""
Harness Executor — Phase 순차 실행 + 상태 관리 + 자동 커밋 + 재시도

사용법:
    python3 scripts/execute.py <task-name>
    python3 scripts/execute.py <task-name> --resume
    python3 scripts/execute.py <task-name> --dry-run
    python3 scripts/execute.py <task-name> --phase 3         # 특정 Phase만

상태 값:
    pending     아직 실행되지 않음
    in-progress 실행 중
    completed   성공 완료
    error       실패 (재시도 소진)
    blocked     사용자 개입 필요
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ────────────────────────────────────────────────────────────
# 설정
# ────────────────────────────────────────────────────────────

MAX_RETRIES = 3
CLAUDE_CMD = "claude"  # Claude Code CLI (헤드리스 모드는 `claude -p`)

REPO_ROOT = Path(__file__).resolve().parent.parent
PHASES_DIR = REPO_ROOT / "phases"


# ────────────────────────────────────────────────────────────
# 유틸
# ────────────────────────────────────────────────────────────

def log(msg: str, level: str = "info") -> None:
    prefix = {"info": "  ", "ok": "✓ ", "err": "✗ ", "warn": "⚠ "}.get(level, "  ")
    print(f"{prefix}{msg}", flush=True)


def banner(msg: str) -> None:
    print("=" * 50, flush=True)
    print(f"  {msg}", flush=True)
    print("=" * 50, flush=True)


def load_index(task: str) -> tuple[Path, dict]:
    index_path = PHASES_DIR / task / "index.json"
    if not index_path.exists():
        raise FileNotFoundError(f"Phase 인덱스를 찾을 수 없습니다: {index_path}")
    with index_path.open("r", encoding="utf-8") as f:
        return index_path, json.load(f)


def save_index(index_path: Path, data: dict) -> None:
    with index_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


# ────────────────────────────────────────────────────────────
# Git
# ────────────────────────────────────────────────────────────

def git_commit(phase_id: int, title: str) -> bool:
    """Phase 완료 후 자동 커밋. Conventional Commits 형식."""
    safe_title = title.strip().replace('"', "'")
    msg = f"feat(phase-{phase_id}): {safe_title}"
    try:
        subprocess.run(["git", "add", "-A"], cwd=REPO_ROOT, check=True)
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=REPO_ROOT,
        )
        if result.returncode == 0:
            log("변경된 파일 없음 — 커밋 생략", "warn")
            return True
        subprocess.run(
            ["git", "commit", "-m", msg],
            cwd=REPO_ROOT,
            check=True,
        )
        log(f"커밋 완료: {msg}", "ok")
        return True
    except subprocess.CalledProcessError as e:
        log(f"커밋 실패: {e}", "err")
        return False


# ────────────────────────────────────────────────────────────
# Phase 실행
# ────────────────────────────────────────────────────────────

def run_phase(task: str, phase: dict) -> str:
    """
    한 Phase를 Claude 헤드리스로 실행.
    반환값: 'completed' | 'error' | 'blocked'
    """
    phase_file = PHASES_DIR / task / phase["file"]
    if not phase_file.exists():
        log(f"Phase 파일 없음: {phase_file}", "err")
        return "error"

    prompt_text = phase_file.read_text(encoding="utf-8")
    wrapped = (
        f"# Phase {phase['id']} 실행 지시\n\n"
        f"아래는 Phase 지시서다. 이대로 구현하라.\n"
        f"완료 후 요약을 출력하고, 수락 기준이 하나라도 미충족이면 그 이유를 명시하라.\n"
        f"사용자에게 질문해야 하는 상황이면 'BLOCKED:'로 시작하는 한 줄로 끝내라.\n\n"
        f"---\n\n{prompt_text}"
    )

    # Claude 헤드리스 호출
    try:
        proc = subprocess.run(
            [CLAUDE_CMD, "-p", wrapped],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60 * 30,  # 30분 타임아웃
        )
    except FileNotFoundError:
        log(f"'{CLAUDE_CMD}' 명령을 찾을 수 없음. Claude Code CLI가 설치돼 있나요?", "err")
        return "error"
    except subprocess.TimeoutExpired:
        log("Phase 실행 시간 초과 (30분)", "err")
        return "error"

    output = (proc.stdout or "") + (proc.stderr or "")

    # 블록 신호 감지
    if "BLOCKED:" in output:
        log("사용자 개입 요청 감지", "warn")
        print(output[-2000:])  # 마지막 2000자 표시
        return "blocked"

    if proc.returncode != 0:
        log(f"Claude가 비정상 종료 (exit {proc.returncode})", "err")
        print(output[-2000:])
        return "error"

    # 수락 기준 자동 검증
    if not run_acceptance_checks():
        log("수락 기준 미충족 (lint/build/test)", "err")
        return "error"

    return "completed"


def run_acceptance_checks() -> bool:
    """기본 수락 기준: lint + build + test 모두 통과해야 함."""
    checks = [
        (["npm", "run", "lint"], "lint"),
        (["npm", "run", "build"], "build"),
        (["npm", "run", "test", "--", "--run"], "test"),  # Vitest 비-watch
    ]
    for cmd, name in checks:
        log(f"수락 기준 체크: {name}", "info")
        try:
            result = subprocess.run(
                cmd, cwd=REPO_ROOT, capture_output=True, text=True, timeout=600
            )
        except subprocess.TimeoutExpired:
            log(f"{name} 타임아웃", "err")
            return False
        except FileNotFoundError:
            log(f"{name}: npm 없음 — 스킵", "warn")
            continue
        if result.returncode != 0:
            log(f"{name} 실패", "err")
            print(result.stdout[-1500:])
            print(result.stderr[-1500:])
            return False
        log(f"{name} 통과", "ok")
    return True


# ────────────────────────────────────────────────────────────
# 메인 루프
# ────────────────────────────────────────────────────────────

def execute(task: str, resume: bool, phase_filter: int | None, dry_run: bool) -> int:
    index_path, index = load_index(task)
    phases = index["phases"]

    pending_phases = [
        p for p in phases
        if (p["status"] in {"pending", "error"} if not phase_filter else p["id"] == phase_filter)
    ]

    total = len(phases)
    pending_count = len(pending_phases)

    banner(f"Harness Executor | Task: {task} | Phases: {total} | Pending: {pending_count}")

    if pending_count == 0:
        log("실행할 Phase가 없습니다. 모두 완료된 상태입니다.", "ok")
        return 0

    if dry_run:
        log("[DRY-RUN] 아래 Phase가 실행될 예정입니다:", "info")
        for p in pending_phases:
            print(f"    • Phase {p['id']}: {p['title']}")
        return 0

    start_time = time.time()

    for phase in pending_phases:
        phase_start = time.time()
        log(f"Phase {phase['id']}: {phase['title']} 시작", "info")
        phase["status"] = "in-progress"
        phase["started_at"] = datetime.now().isoformat()
        save_index(index_path, index)

        # 재시도 루프
        outcome = "error"
        for attempt in range(1, MAX_RETRIES + 1):
            if attempt > 1:
                log(f"재시도 {attempt}/{MAX_RETRIES}", "warn")
            outcome = run_phase(task, phase)
            if outcome in {"completed", "blocked"}:
                break

        # 결과 처리
        elapsed = int(time.time() - phase_start)
        if outcome == "completed":
            phase["status"] = "completed"
            phase["completed_at"] = datetime.now().isoformat()
            phase["elapsed_seconds"] = elapsed
            save_index(index_path, index)
            log(f"Phase {phase['id']} 완료 [{elapsed}s]", "ok")
            git_commit(phase["id"], phase["title"])
        elif outcome == "blocked":
            phase["status"] = "blocked"
            save_index(index_path, index)
            log(f"Phase {phase['id']} 차단 — 사용자 개입 필요. 실행 중단.", "err")
            return 2
        else:  # error
            phase["status"] = "error"
            phase["last_error_at"] = datetime.now().isoformat()
            save_index(index_path, index)
            log(f"Phase {phase['id']} 실패 — 재시도 소진. 실행 중단.", "err")
            return 1

    total_elapsed = int(time.time() - start_time)
    banner(f"Task '{task}' 완료! 총 소요 {total_elapsed}s")
    return 0


# ────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Harness Phase Executor")
    parser.add_argument("task", help="Task 이름 (phases/ 하위 폴더명)")
    parser.add_argument("--resume", action="store_true", help="중단된 task 이어서 실행")
    parser.add_argument("--phase", type=int, default=None, help="특정 Phase 번호만 실행")
    parser.add_argument("--dry-run", action="store_true", help="실행 계획만 표시")
    args = parser.parse_args()
    return execute(args.task, args.resume, args.phase, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
