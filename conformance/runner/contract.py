"""적합성 케이스와 계약 파일을 읽는 최소 로더다."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "conformance" / "cases"
SUFFIX = ".json"


def contract_root() -> Path:
    """계약 뿌리의 절대 경로이며 스위트를 붙인 구현체는 이 아래만 읽는다."""
    return ROOT


def read_version() -> str:
    """이 계약의 판이며 구현체는 자기가 고정한 판과 대조한다."""
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def read_json(relative: str) -> Any:
    """계약 뿌리를 기준으로 한 상대 경로의 JSON 파일 하나를 읽는다."""
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def list_cases() -> list[str]:
    """적합성 케이스의 이름을 사전순으로 낸다."""
    return sorted(path.stem for path in CASES.glob(f"*{SUFFIX}"))


def read_case(name: str) -> Any:
    """이름으로 적합성 케이스 하나를 읽는다."""
    return json.loads((CASES / f"{name}{SUFFIX}").read_text(encoding="utf-8"))


def read_agent_spec(agent_id: str) -> Any:
    """에이전트 하나의 명세를 읽는다."""
    return read_json(f"agent/{agent_id}/spec.json")


def read_shared(file_name: str) -> Any:
    """네 에이전트가 함께 쓰는 계약 파일 하나를 읽는다."""
    return read_json(f"agent/shared/{file_name}")
