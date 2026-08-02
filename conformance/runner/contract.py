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
AGENT_FILES = ["agent.json", "prompt.json", "tool.json", "output.json", "cases.json"]
AXIS_SURFACE_ROOTS = ["agent", "conformance/cases", "db", "http", "wire", "workflow"]
AXIS_SURFACE_SUFFIXES = (".json", ".yaml", ".md", ".sql")
JOB_AXIS_COLUMN_PATTERN = r'ALTER TABLE "ai_jobs" ADD COLUMN[^;]*"backend"[^;]*;'
CHAT_AXIS_INDEX_PATTERN = r'CREATE INDEX[^;]*"chat_executions"[^;]*"requested_backend"[^;]*;'


def contract_root() -> Path:
    """계약 뿌리의 절대 경로이며 스위트를 붙인 구현체는 이 아래만 읽는다."""
    return ROOT


def read_version() -> str:
    """이 계약의 판이며 구현체는 자기가 고정한 판과 대조한다."""
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def read_text(relative: str) -> str:
    """계약 뿌리를 기준으로 한 상대 경로의 파일 하나를 글자 그대로 읽는다."""
    return (ROOT / relative).read_text(encoding="utf-8")


def read_json(relative: str) -> Any:
    """계약 뿌리를 기준으로 한 상대 경로의 JSON 파일 하나를 읽는다."""
    return json.loads(read_text(relative))


def list_axis_surfaces() -> list[str]:
    """축의 이름을 담을 수 있는 계약 파일을 뿌리 기준 상대 경로로 사전순으로 낸다."""
    return sorted(
        str(path.relative_to(ROOT))
        for root in AXIS_SURFACE_ROOTS
        for path in (ROOT / root).rglob("*")
        if path.is_file() and path.name.endswith(AXIS_SURFACE_SUFFIXES)
    )


def list_migrations() -> list[str]:
    """migration 파일의 이름을 번호 순서로 낸다."""
    return sorted(path.name for path in (ROOT / "db" / "migrations").glob("*.sql"))


def read_job_ledger_axis_column() -> str | None:
    """잡 원장에 축의 칸을 더하는 선언을 낸다."""
    for name in list_migrations():
        declared = re.search(JOB_AXIS_COLUMN_PATTERN, read_text(f"db/migrations/{name}"))
        if declared is not None:
            return declared.group(0)
    return None


def read_chat_ledger_axis_index() -> str | None:
    """대화 실행 원장이 축으로 대기 줄을 가르는 색인 선언을 낸다."""
    for name in list_migrations():
        declared = re.search(CHAT_AXIS_INDEX_PATTERN, read_text(f"db/migrations/{name}"), re.DOTALL)
        if declared is not None:
            return declared.group(0)
    return None


def read_chat_thread_queue() -> dict[str, Any]:
    """스레드 워크플로가 받는 신호의 인자와 부르는 액티비티의 이름을 낸다."""
    declared = read_text("workflow/queues.yaml")
    found = re.search(r"^ {2}chatThread:\n(?: {4}.*\n| *\n)*", declared, re.MULTILINE)
    clause = "" if found is None else found.group(0)
    block = re.search(r"^ {4}activities:\n(?: {6}.*\n| *\n)*", clause, re.MULTILINE)
    activities = "" if block is None else block.group(0)
    args = re.search(r"^ {8}args: \[(.*)\]$", clause, re.MULTILINE)
    return {
        "signalArgs": None if args is None else args.group(1).split(", "),
        "activities": re.findall(r"^ {6}- name: (\S+)$", activities, re.MULTILINE),
    }


def read_worker_sdk_metrics() -> dict[str, Any]:
    """워커가 여는 SDK 지표 창구의 포트와 시간 단위를 낸다."""
    declared = read_text("workflow/metrics.yaml")
    port = re.search(r"^ {2}port: (\d+)$", declared, re.MULTILINE)
    unit = re.search(r"^ {2}durationUnit: (\S+)$", declared, re.MULTILINE)
    return {
        "port": None if port is None else int(port.group(1)),
        "durationUnit": None if unit is None else unit.group(1),
        **_read_name_suffixes(declared),
    }


def _read_name_suffixes(declared: str) -> dict[str, bool | None]:
    """지표의 이름을 빚는 접미사 둘을 낸다. 선언하지 않았으면 None 이다."""
    found = {}
    for name in ("countersTotalSuffix", "unitSuffix"):
        match = re.search(rf"^ {{2}}{name}: (true|false)$", declared, re.MULTILINE)
        found[name] = None if match is None else match.group(1) == "true"
    return found


def read_axis_label_names() -> dict[str, str | None]:
    """축을 싣는 두 이름을 낸다. 계측이 쓰는 속성 이름과 지표 창구가 싣는 라벨 이름이다."""
    declared = read_text("workflow/metrics.yaml")
    attribute = re.search(r"^ {4}attributeKey: (\S+)$", declared, re.MULTILINE)
    label = re.search(r"^ {4}labelName: (\S+)$", declared, re.MULTILINE)
    return {
        "attributeKey": None if attribute is None else attribute.group(1),
        "labelName": None if label is None else label.group(1),
    }


def read_redaction() -> Any:
    """가릴 낱말과 비교 절차와 표시와 자리를 읽는다."""
    return read_json("agent/shared/redaction.json")


def read_scope_token() -> Any:
    """실행에 매인 자격의 모양을 읽는다."""
    return read_json("agent/shared/scope.token.json")


def read_settlement() -> Any:
    """실행을 종결로 접는 조건을 읽는다."""
    return read_json("agent/shared/execution.vocabulary.json").get("settlement", {})


def read_identifier_rules() -> Any:
    """식별자마다의 값 규칙을 읽는다."""
    return read_json("agent/shared/execution.vocabulary.json").get("identifierRules", {})


def read_run_observation_rules() -> Any:
    """실행 관측 값마다의 규칙을 읽는다."""
    return read_json("agent/shared/execution.vocabulary.json").get("runObservationRules", {})


def read_trace_attribute_names() -> list[str]:
    """추적이 나르는 속성의 이름을 선언한 순서로 낸다."""
    found: list[str] = []
    inside = False
    for line in read_text("workflow/trace.attributes.yaml").split("\n"):
        if re.match(r"^\S", line):
            inside = line == "attributes:"
        elif inside:
            declared = re.match(r"^ {2}([\w.]+):$", line)
            if declared is not None:
                found.append(declared.group(1))
    return found


def list_cases() -> list[str]:
    """적합성 케이스의 이름을 사전순으로 낸다."""
    return sorted(path.stem for path in CASES.glob(f"*{SUFFIX}"))


def read_case(name: str) -> Any:
    """이름으로 적합성 케이스 하나를 읽는다."""
    return json.loads((CASES / f"{name}{SUFFIX}").read_text(encoding="utf-8"))


def list_agent_files(agent_id: str) -> list[str]:
    """에이전트 하나가 갖는 계약 파일의 이름을 정해진 순서로 낸다."""
    present = {path.name for path in (ROOT / "agent" / agent_id).iterdir()}
    return [name for name in AGENT_FILES if name in present]


def read_agent_meta(agent_id: str) -> Any:
    """에이전트의 정체를 읽는다."""
    return read_json(f"agent/{agent_id}/agent.json")


def read_agent_prompt(agent_id: str) -> Any:
    """에이전트의 프롬프트 조각과 템플릿을 읽는다."""
    return read_json(f"agent/{agent_id}/prompt.json")


def read_agent_tools(agent_id: str) -> Any:
    """에이전트의 도구와 인자와 상한을 읽는다."""
    return read_json(f"agent/{agent_id}/tool.json")


def read_agent_output(agent_id: str) -> Any:
    """에이전트의 구조화 출력 스키마를 읽는다."""
    return read_json(f"agent/{agent_id}/output.json")


def read_agent_cases(agent_id: str) -> Any:
    """에이전트의 판정 케이스를 읽는다."""
    return read_json(f"agent/{agent_id}/cases.json")


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


def read_openapi_enum(schema_name: str) -> list[str]:
    """OpenAPI 가 선언한 이름 붙은 enum 하나의 값을 낸다."""
    spec = (ROOT / "http" / "agent-api.openapi.yaml").read_text(encoding="utf-8")
    pattern = rf"^ {{4}}{schema_name}:\n(?: {{6}}.*\n)*? {{6}}enum: \[([^\]]*)\]"
    declared = re.search(pattern, spec, re.MULTILINE)
    if declared is None:
        raise SystemExit(f"{schema_name} 이 enum 을 선언하지 않는다")
    return [value.strip() for value in declared.group(1).split(",")]


def route_key(route: dict[str, str]) -> str:
    """메서드와 경로를 한 문자열로 모아 대조와 정렬의 키로 쓴다."""
    return f"{route['method']} {normalize_path_template(route['path'])}"


def read_agent_api_routes() -> list[dict[str, str]]:
    """에이전트 서비스가 열어야 하는 창구를 메서드와 경로의 쌍으로 사전순으로 낸다."""
    spec = (ROOT / "http" / "agent-api.openapi.yaml").read_text(encoding="utf-8")
    routes: list[dict[str, str]] = []
    path: str | None = None
    for line in spec.split("\n"):
        declared = re.match(r"^ {2}(/\S+):$", line)
        if declared:
            path = declared.group(1)
            continue
        if path is None:
            continue
        method = re.match(r"^ {4}(get|post|put|patch|delete):$", line)
        if method:
            routes.append(
                {"method": method.group(1).upper(), "path": normalize_path_template(path)}
            )
        elif re.match(r"^ {0,3}\S", line):
            path = None
    return sorted(routes, key=route_key)


def read_tool_binding_paths() -> list[dict[str, str]]:
    """대화 도구가 어느 경로의 뷰인지를 도구 이름 순으로 낸다."""
    bindings = read_agent_tools("chat")["bindings"]["bindings"]
    return [
        {"name": name, "method": binding["method"], "path": binding["path"]}
        for name, binding in sorted(bindings.items())
    ]


def read_tool_surfaces() -> dict[str, list[str]]:
    """도구가 열리는 표면마다 도구 이름을 사전순으로 모아 낸다."""
    tools = read_agent_tools("chat")["tools"]
    grouped: dict[str, list[str]] = {}
    for name in sorted(tools):
        grouped.setdefault(tools[name]["surface"], []).append(name)
    return grouped


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
