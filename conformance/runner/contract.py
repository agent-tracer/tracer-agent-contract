"""적합성 케이스와 계약 파일을 읽는 최소 로더다."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "conformance" / "cases"
SUFFIX = ".json"
HTTP_SURFACES = ["agent-api.openapi.yaml", "tracer-dependency.openapi.yaml"]


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


def normalize_path_template(path: str) -> str:
    """경로 변수의 이름은 선언하는 쪽의 사정이므로 표면을 대조할 때는 변수 자리만 남긴다."""
    return re.sub(r"\{[^}]*\}", "{}", path)


def read_dependency_paths() -> list[str]:
    """에이전트가 추적 API에 요구하는 경로를 사전순으로 낸다."""
    return sorted(_read_surface_paths("tracer-dependency.openapi.yaml"))


def read_declared_http_paths() -> list[str]:
    """계약이 선언한 HTTP 경로 전부를 변수 이름을 지운 꼴로 사전순으로 낸다."""
    declared = (
        normalize_path_template(path)
        for file_name in HTTP_SURFACES
        for path in _read_surface_paths(file_name)
    )
    return sorted(set(declared))


def _read_surface_paths(file_name: str) -> list[str]:
    spec = (ROOT / "http" / file_name).read_text(encoding="utf-8")
    return re.findall(r"^ {2}(/\S+):$", spec, re.MULTILINE)


def read_tool_binding_paths() -> list[dict[str, str]]:
    """대화 도구가 어느 경로의 뷰인지를 도구 이름 순으로 낸다."""
    bindings = read_agent_spec("chat")["bindings"]["bindings"]
    return [
        {"name": name, "method": binding["method"], "path": binding["path"]}
        for name, binding in sorted(bindings.items())
    ]


def read_enforcement() -> Any:
    """계약의 어느 자리가 강제이고 어느 자리가 기록인지를 읽는다."""
    return read_json("conformance/enforcement.json")


def enforcement_level(path: str) -> str:
    """자리 하나가 강제인지 기록인지를 내며 어느 목록에도 닿지 않으면 unclassified를 낸다."""
    levels = read_enforcement()["levels"]
    for level in ("enforced", "recorded"):
        if any(path == prefix or path.startswith(prefix) for prefix in levels[level]["paths"]):
            return level
    return "unclassified"
