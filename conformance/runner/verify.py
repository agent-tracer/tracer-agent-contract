"""로더가 계약 파일과 케이스를 읽어 낼 수 있고 자리마다 강제와 기록이 정해졌는지 확인한다."""

from __future__ import annotations

import json
import re
import sys
import urllib.request

from contract import (
    enforcement_level,
    list_agent_files,
    list_axis_surfaces,
    list_cases,
    normalize_path_template,
    read_agent_api_routes,
    read_agent_cases,
    read_agent_meta,
    read_agent_output,
    read_agent_prompt,
    read_agent_tools,
    read_case,
    read_declared_http_paths,
    read_axis_label_names,
    read_chat_ledger_axis_index,
    read_chat_thread_queue,
    read_job_ledger_axis_column,
    read_json,
    read_ledger_tables,
    read_mcp_tool_names,
    read_openapi_enum,
    read_redaction,
    read_scope_token,
    read_search_index,
    read_search_outbox_target,
    read_shared,
    read_table_columns,
    read_identifier_rules,
    read_run_observation_rules,
    read_settlement,
    read_text,
    read_tool_binding_paths,
    read_tool_surfaces,
    read_trace_attribute_names,
    read_version,
    read_worker_sdk_metrics,
    route_key,
)

SURFACE_PATH = "/internal/surface"


def read_served_routes(base_url: str) -> set[str]:
    """도는 서버가 자기 라우팅 표를 그대로 내므로 그것을 계약이 선언한 창구와 대조한다."""
    with urllib.request.urlopen(base_url.rstrip("/") + SURFACE_PATH) as response:
        body = json.loads(response.read().decode("utf-8"))
    return {route_key(route) for route in body["data"]["routes"]}

AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup"]
SHARED = [
    "languages.json",
    "settings.execution.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "execution.budget.json",
    "execution.limits.json",
    "model.envelope.json",
    "model.rates.json",
    "redaction.json",
    "scope.token.json",
    "text.limits.json",
    "dispatch.plan.json",
    "ledger.availability.json",
]
WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json", "search.index.json"]
# 레시피와 정리 제안의 원장이 에이전트 원장이므로 이 표들이 없으면 그 창구가 설 자리가 없다.
LEDGER_TABLES = ["recipes", "recipe_applications", "task_cleanup_suggestions", "search_outbox"]
# 얇은 적중의 이 두 칸은 문서의 칸이 아니라 문서의 식별자와 색인이 매긴 점수에서 온다.
HIT_FIELDS_OUTSIDE_DOCUMENT = ["recipeId", "score"]
INSTANT_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
SEARCH_INDEX_PLACES = ["alias", "index", "documentId", "settings", "document", "query"]
# 에이전트 상류가 없으면 등록되지 않아야 하는 MCP 도구이며 넷 다 에이전트 표면을 부른다.
MCP_AGENT_TOOLS = ["get_recipe", "report_recipe_outcome", "request_recipe_scan", "search_recipes"]
# 적용 이력 행이 사건에서 오므로 그 사건이 실어야 하는 칸이 없으면 행을 만들 수 없다.
PROJECTION_GUARDS = ["missingFields", "alreadyOpen", "redelivery"]


def has_activity_since(last_event_at: object, observed_at: object) -> bool:
    """조건보다 뒤에 도착한 사건만 새 활동이다. 같은 시각은 새 활동이 아니다."""
    # 시각의 표기가 한 벌이므로 글자 비교가 곧 시각 비교다.
    if not isinstance(last_event_at, str) or re.match(INSTANT_PATTERN, last_event_at) is None:
        return False
    if not isinstance(observed_at, str) or re.match(INSTANT_PATTERN, observed_at) is None:
        return True
    return last_event_at > observed_at
TOPIC_FIELDS = ["name", "key", "payload", "delivery"]
STREAM_KEYS = [
    "meaning",
    "method",
    "path",
    "contentType",
    "event",
    "frame",
    "frameFields",
    "replay",
    "reconnect",
    "draftReset",
    "draft",
    "resendIntervalMs",
    "headers",
]
STREAM_NESTED = {
    "replay": ["mode", "lastEventId", "reason"],
    "reconnect": ["initialBackoffMs", "maxBackoffMs", "resetOn", "resetOnReason", "stopOn"],
    "draft": ["intervalMs", "edge", "meaning", "firstChunk", "coalesce", "seqUnit", "nonBlocking"],
    "headers": ["Cache-Control", "Connection", "X-Accel-Buffering"],
}
STREAM_PLACES = len(STREAM_KEYS) + sum(len(keys) for keys in STREAM_NESTED.values())
STANDALONE = [
    "workflow/queues.yaml",
    "workflow/metrics.yaml",
    "workflow/trace.attributes.yaml",
    "http/agent-api.openapi.yaml",
    "http/tracer-dependency.openapi.yaml",
]
AXIS_VALUES = ["ts", "python"]
THREAD_SIGNAL_ARGS = ["executionId"]
THREAD_ACTIVITIES = ["getNextChatExecution"]
TOOL_SURFACES = ["read", "agentRead", "memory", "confirm"]
CONFIRM_SURFACE = "confirm"
# 프롬프트가 확인 도구 하나를 즉시 실행이라고 적으면 모델이 서지 않은 쓰기를 섰다고 답한다.
IMMEDIATE_PHRASES = ["runs immediately", "run immediately", "runs right away", "without confirmation"]
PROVIDER_REQUEST_RULES = ["unit", "source", "absent", "notSession", "manyCalls"]
TTFT_RULES = ["unit", "source", "absent", "notDuration", "noEstimate"]
RESULT_PLACES = ["meaning", "byKind"]
CREDENTIAL_CHECK_PLACES = ["meaning", "appliesTo", "rejection", "reason", "notEnvelope"]
PACING_PLACES = ["meaning", "unit", "progressNotice", "landingDirective"]
TURN_LEDGER_PLACES = [
    "meaning",
    "totalIsWholeExecution",
    "lease",
    "settle",
    "settleWithoutReport",
    "settleFromUsage",
    "reservationReturn",
]
PROGRESS_NOTICE_PLACES = ["template", "when", "placeholders", "reason"]
LANDING_DIRECTIVE_PLACES = ["when", "structured", "freeText", "reason"]
NON_AXIS_WORDS = ["claude-sdk", "typescript"]
AXIS_DURATION_UNIT = "seconds"
# 지표 창구는 수집기를 지나지 않으므로 Prometheus 의 고전 라벨 이름 규칙을 그대로 받는다.
LABEL_NAME = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
NAME_SUFFIXES = ["countersTotalSuffix", "unitSuffix"]
REDACTION_PLACES = ["marker", "matching", "keys", "values", "onSuspect", "stages"]
SCOPE_TOKEN_PLACES = (
    "meaning",
    "prefix",
    "prefixReason",
    "shape",
    "payload",
    "signature",
    "secret",
    "lifetime",
    "precedence",
)
SETTLEMENT_PLACES = ("meaning", "fromQueued", "fromRunning", "appliesTo", "reason", "note")
REDACTION_STAGES = ["trace", "query", "output"]
VALUE_BODY_PLACES = ["minLength", "charset", "skipSpaceBetween"]
SUSPECT_SPAN_PLACES = ["byKey", "byValue", "spanBounds"]
ON_SUSPECT_ACTIONS = ["redact", "discard"]
# 실행에 실험의 자리가 없으므로 이 이름은 어느 속성으로도 나가지 않는다.
RETIRED_ATTRIBUTES = [
    "agent_tracer.experiment.id",
    "agent_tracer.example.id",
    "agent_tracer.variant.id",
]



LIMIT_PROXIMITY = 160
"""칸 이름과 그 수 사이에 이만큼 안에서 만나야 그 수가 그 칸을 말한 것으로 본다."""


def schema_limit_sites(agent_id: str) -> list[tuple[str, int]]:
    """스키마가 상한을 건 자리마다 그 상한이 걸린 칸의 이름과 수를 낸다."""
    sites: dict[str, tuple[str, int]] = {}

    def walk(node: object, field: str | None) -> None:
        if isinstance(node, list):
            for entry in node:
                walk(entry, field)
            return
        if not isinstance(node, dict):
            return
        for keyword in ("maxLength", "maxItems"):
            value = node.get(keyword)
            if isinstance(value, int) and not isinstance(value, bool) and value > 1 and field is not None:
                sites[f"{field}:{value}"] = (field, value)
        for key, nested in node.items():
            if key in ("properties", "$defs") and isinstance(nested, dict):
                for name, child in nested.items():
                    walk(child, name)
                continue
            walk(nested, field)

    walk(read_agent_output(agent_id)["schema"], None)
    return list(sites.values())


def prompt_body(agent_id: str) -> str:
    """모델이 실제로 읽는 프롬프트 본문이며 실행이 채우는 자리표시자를 계약의 값으로 채워 둔다."""
    lines: list[str] = []
    for fragment in read_agent_prompt(agent_id)["fragments"].values():
        content = fragment.get("content")
        if isinstance(content, list):
            lines.extend(content)
        for variant in (fragment.get("byLanguage") or {}).values():
            lines.extend(variant)
    body = "\n".join(lines)
    for name, value in (read_agent_tools(agent_id).get("limits") or {}).items():
        body = body.replace(f"${{{name}}}", str(value))
    return body


def states_limit(body: str, field: str, value: int) -> bool:
    """칸의 이름과 그 수가 서로 가까이 있으면 그 수가 그 칸을 말한 것으로 본다. 문장은 두 순서로 모두 쓰인다."""
    name = re.escape(field)
    gap = f"[\\s\\S]{{0,{LIMIT_PROXIMITY}}}?"
    after = re.search(rf"\b{name}\b{gap}\b{value}\b", body)
    before = re.search(rf"\b{value}\b{gap}\b{name}\b", body)
    return bool(after or before)


def schema_limits_missing_from_prompt(agent_id: str) -> list[str]:
    """모델이 지켜야 하는 상한은 스키마에만 두면 모델에게 닿지 않으므로 프롬프트 본문에도 있어야 한다.

    수만 세면 같은 수를 쓰는 다른 칸이 서로를 통과시키므로 칸의 이름 곁에서 그 수를 찾는다.
    """
    body = prompt_body(agent_id)
    return [f"{field} 의 {value}" for field, value in schema_limit_sites(agent_id) if not states_limit(body, field, value)]


def confirm_tools_called_immediate(agent_id: str, confirm_tools: list[str]) -> list[str]:
    """확인을 받아야 하는 도구를 즉시 실행이라고 적은 프롬프트 문장을 찾는다."""
    fragments = read_agent_prompt(agent_id)["fragments"]
    lines: list[str] = []
    for fragment in fragments.values():
        content = fragment.get("content")
        if isinstance(content, list):
            lines.append(" ".join(str(line) for line in content))
    found: list[str] = []
    for sentence in re.split(r"(?<=[.:])\s+", " ".join(lines)):
        lowered = sentence.lower()
        if not any(phrase in lowered for phrase in IMMEDIATE_PHRASES):
            continue
        found.extend(f"{name}: {sentence.strip()}" for name in confirm_tools if name in sentence)
    return found


def main() -> None:
    version = read_version()
    cases = list_cases()
    surfaces: list[str] = []

    for name in cases:
        read_case(name)
        surfaces.append(f"conformance/cases/{name}.json")

    agent_readers = {
        "agent.json": read_agent_meta,
        "prompt.json": read_agent_prompt,
        "tool.json": read_agent_tools,
        "output.json": read_agent_output,
        "cases.json": read_agent_cases,
        "summary.json": lambda agent: read_json(f"agent/{agent}/summary.json"),
    }
    agent_file_count = 0
    for agent in AGENTS:
        for file_name in list_agent_files(agent):
            agent_readers[file_name](agent)
            surfaces.append(f"agent/{agent}/{file_name}")
            agent_file_count += 1
    for file_name in SHARED:
        read_json(f"agent/shared/{file_name}")
        surfaces.append(f"agent/shared/{file_name}")
    for file_name in WIRE:
        read_json(f"wire/{file_name}")
        surfaces.append(f"wire/{file_name}")
    surfaces.extend(STANDALONE)

    grouped: dict[str, list[str]] = {"enforced": [], "recorded": [], "unclassified": []}
    for surface in surfaces:
        grouped[enforcement_level(surface)].append(surface)

    # 목록을 손으로 적는 자리이므로 계약에 파일을 더하고 목록에 적지 않으면 그 자리는 조용히 검사 밖에 선다.
    counted_surfaces = set(surfaces)
    unlisted_agent_files = [
        path
        for path in list_axis_surfaces()
        if path.startswith("agent/") and path.endswith(".json") and path not in counted_surfaces
    ]

    stream = read_case("chat.query").get("stream", {})
    missing_stream = [f"stream.{key}" for key in STREAM_KEYS if key not in stream] + [
        f"stream.{group}.{key}"
        for group, keys in STREAM_NESTED.items()
        for key in keys
        if key not in stream.get(group, {})
    ]

    axis = read_openapi_enum("AgentAxis")
    axis_surfaces = list_axis_surfaces()
    stray_axis_names = [
        f"{surface} 의 {word}"
        for surface in axis_surfaces
        for word in NON_AXIS_WORDS
        if word in read_text(surface).lower()
    ]
    axis_column = read_job_ledger_axis_column()
    chat_axis_index = read_chat_ledger_axis_index()
    thread_queue = read_chat_thread_queue()
    tool_surfaces = read_tool_surfaces()
    declared_surfaces = read_case("chat.tools")["tools"]
    # action 마다 필요한 인자가 다르므로 그 표가 없거나 action 하나를 빠뜨리면 그 갈래는 아무것도 요구하지 않게 된다.
    chat_tools = read_agent_tools("chat")["tools"]
    broken_required_by_action: list[str] = []
    for name, tool in chat_tools.items():
        if tool.get("surface") != CONFIRM_SURFACE or "action" not in tool.get("args", {}):
            continue
        declared = tool.get("requiredByAction")
        if declared is None:
            broken_required_by_action.append(f"{name} 이 requiredByAction 을 갖지 않는다")
            continue
        values = tool["args"]["action"].get("values", [])
        broken_required_by_action.extend(f"{name}.{value} 가 표에 없다" for value in values if value not in declared)
        broken_required_by_action.extend(f"{name}.{key} 는 action 이 아니다" for key in declared if key not in values)
        broken_required_by_action.extend(
            f"{name}.{action} 이 없는 인자 {arg_name} 을 요구한다"
            for action, arg_names in declared.items()
            for arg_name in arg_names
            if arg_name not in tool["args"]
        )

    immediate_confirm_tools = confirm_tools_called_immediate(
        "chat", tool_surfaces.get(CONFIRM_SURFACE, [])
    )
    worker_metrics = read_worker_sdk_metrics()
    axis_label = read_axis_label_names()

    redaction = read_redaction()
    missing_redaction = [place for place in REDACTION_PLACES if place not in redaction]
    redaction_words = {
        "keys": redaction.get("keys", {}).get("words", []),
        "values": redaction.get("values", {}).get("words", []),
    }
    empty_redaction_words = [name for name, words in redaction_words.items() if not words]
    # 걸린 자리가 어디까지인지 정하지 않으면 한 축은 본문을 통째로 바꾸고 다른 축은 구간만 바꾼다.
    suspect_span = redaction.get("onSuspect", {}).get("suspectSpan", {})
    missing_suspect_span = [place for place in SUSPECT_SPAN_PLACES if place not in suspect_span]
    # 값 쪽 낱말은 사람이 쓴 본문에도 나오므로 몸통을 요구하는 자리가 없으면 답이 통째로 가려진다.
    trailing_body = redaction.get("values", {}).get("requiresTrailingBody", {})
    missing_trailing_body = [place for place in VALUE_BODY_PLACES if place not in trailing_body]
    stages = redaction.get("stages", {})
    missing_stages = [name for name in REDACTION_STAGES if name not in stages]
    stray_on_suspect = [
        f"{name} {stages[name].get('onSuspect', '없음')}"
        for name in REDACTION_STAGES
        if name in stages and stages[name].get("onSuspect") not in ON_SUSPECT_ACTIONS
    ]
    trace_attributes = read_trace_attribute_names()
    trace_attribute_text = read_text("workflow/trace.attributes.yaml")
    retired_attributes = [name for name in RETIRED_ATTRIBUTES if name in trace_attribute_text]

    topics = read_json("wire/topics.json")
    incomplete_topics = [
        topic_id
        for topic_id, topic in topics.items()
        if any(field not in topic for field in TOPIC_FIELDS)
    ]

    declared_paths = set(read_declared_http_paths())
    bindings = read_tool_binding_paths()
    unmet = [
        binding
        for binding in bindings
        if normalize_path_template(binding["path"]) not in declared_paths
    ]

    intake_kinds = read_case("job.intake")["kinds"]
    ledger_kinds = list(read_json("wire/job.kinds.json")["kinds"].keys())
    kind_mismatch = [
        (where, values)
        for where, values in (
            ("OpenAPI 의 JobKind", read_openapi_enum("JobKind")),
            ("wire/job.kinds.json", ledger_kinds),
        )
        if sorted(values) != sorted(intake_kinds)
    ]

    if not cases:
        raise SystemExit("적합성 케이스가 하나도 없다")
    if unlisted_agent_files:
        unlisted = ", ".join(unlisted_agent_files)
        raise SystemExit(f"계약에 있으나 검사기가 세지 않는 자리가 있다 — {unlisted}")
    if grouped["unclassified"]:
        unclassified = ", ".join(grouped["unclassified"])
        raise SystemExit(f"강제인지 기록인지 정해지지 않은 자리가 있다 — {unclassified}")
    if unmet:
        detail = ", ".join(f"{binding['name']} {binding['path']}" for binding in unmet)
        raise SystemExit(f"도구가 부르는 경로를 어느 HTTP 표면도 선언하지 않는다 — {detail}")
    if kind_mismatch:
        detail = " · ".join(f"{where} 는 {', '.join(values)}" for where, values in kind_mismatch)
        raise SystemExit(
            f"접수가 받는 잡 종류가 자리마다 다르다 — job.intake 는 {', '.join(intake_kinds)} 인데 {detail}"
        )
    if incomplete_topics:
        fields = " · ".join(TOPIC_FIELDS)
        raise SystemExit(f"토픽 선언에 {fields} 가 다 있어야 한다 — {', '.join(incomplete_topics)}")
    if missing_stream:
        raise SystemExit(f"실행 스트림 절에 있어야 할 자리가 없다 — {', '.join(missing_stream)}")
    if axis != AXIS_VALUES:
        raise SystemExit(
            f"축의 이름은 {', '.join(AXIS_VALUES)} 둘이다 — AgentAxis 는 {', '.join(axis)} 다"
        )
    if stray_axis_names:
        raise SystemExit(f"축의 이름이 될 수 없는 낱말이 계약에 있다 — {', '.join(stray_axis_names)}")
    if axis_column is None:
        raise SystemExit("migration 이 잡 원장에 축의 칸을 더하지 않는다 — ai_jobs 에 backend 가 없다")
    if "NOT NULL" not in axis_column:
        raise SystemExit(f"잡 원장의 축은 비어 있을 수 없다 — {axis_column}")
    stray_tool_surfaces = [name for name in tool_surfaces if name not in TOOL_SURFACES]
    if stray_tool_surfaces:
        raise SystemExit(
            f"도구가 열리는 표면은 {', '.join(TOOL_SURFACES)} 넷이다 — "
            f"{', '.join(stray_tool_surfaces)} 는 그중에 없다"
        )
    surface_mismatch = [
        name
        for name in TOOL_SURFACES
        if tool_surfaces.get(name, []) != declared_surfaces.get(name, [])
    ]
    if surface_mismatch:
        detail = " · ".join(
            f"{name} 은 {', '.join(tool_surfaces.get(name, [])) or '없음'} 인데 "
            f"케이스는 {', '.join(declared_surfaces.get(name, [])) or '없음'} 다"
            for name in surface_mismatch
        )
        raise SystemExit(f"도구의 표면과 적합성이 적은 목록이 다르다 — {detail}")
    promptless_limits = [
        f"{agent} 의 {site}"
        for agent in AGENTS
        for site in schema_limits_missing_from_prompt(agent)
    ]
    if promptless_limits:
        detail = " · ".join(promptless_limits)
        raise SystemExit(f"스키마가 요구하는 수치를 프롬프트가 모델에게 알리지 않는다 — {detail}")
    if broken_required_by_action:
        broken = " · ".join(broken_required_by_action)
        raise SystemExit(f"action 이 요구하는 인자의 표가 어긋난다 — {broken}")
    if immediate_confirm_tools:
        raise SystemExit(
            "프롬프트가 확인을 받아야 하는 도구를 즉시 실행이라고 적는다 — "
            f"{' · '.join(immediate_confirm_tools)}"
        )
    if chat_axis_index is None:
        raise SystemExit(
            "migration 이 대화 실행 원장의 대기 줄을 축으로 가르지 않는다 — requested_backend 색인이 없다"
        )
    if (thread_queue["signalArgs"] or []) != THREAD_SIGNAL_ARGS:
        declared = ", ".join(thread_queue["signalArgs"] or ["없음"])
        raise SystemExit(
            "스레드 시그널은 대기 줄이 움직였다는 포인터 하나만 나른다 — "
            f"{', '.join(THREAD_SIGNAL_ARGS)} 여야 하는데 {declared} 다"
        )
    if thread_queue["activities"] != THREAD_ACTIVITIES:
        declared = ", ".join(thread_queue["activities"]) or "없음"
        raise SystemExit(
            "대기 줄의 주인이 원장이므로 스레드 워크플로가 그것을 읽는 창구를 계약이 적어야 한다 — "
            f"{', '.join(THREAD_ACTIVITIES)} 여야 하는데 {declared} 다"
        )
    if worker_metrics["port"] is None or worker_metrics["durationUnit"] != AXIS_DURATION_UNIT:
        port = worker_metrics["port"] or "없음"
        unit = worker_metrics["durationUnit"] or "없음"
        raise SystemExit(
            f"워커 지표 창구는 포트와 {AXIS_DURATION_UNIT} 단위를 함께 적어야 한다 — "
            f"포트 {port}, 단위 {unit}"
        )
    if any(worker_metrics[name] is None for name in NAME_SUFFIXES):
        raise SystemExit(
            f"지표의 이름을 빚는 값은 기본에 기대지 않고 계약이 적는다 — {' · '.join(NAME_SUFFIXES)}"
        )
    attribute_key = axis_label["attributeKey"]
    label_name = axis_label["labelName"]
    if attribute_key is None or label_name is None:
        raise SystemExit("축의 라벨은 계측이 쓰는 속성 이름과 창구가 싣는 라벨 이름을 함께 적어야 한다")
    if LABEL_NAME.match(label_name) is None:
        raise SystemExit(
            f"지표 창구가 싣는 라벨 이름은 Prometheus 가 그대로 읽을 수 있어야 한다 — {label_name}"
        )
    if attribute_key.replace(".", "_") != label_name:
        raise SystemExit(
            f"수집기가 점을 밑줄로 바꾼 이름이 라벨 이름과 같아야 한다 — "
            f"{attribute_key} 와 {label_name}"
        )
    if missing_redaction:
        raise SystemExit(f"가리는 규칙에 있어야 할 자리가 없다 — {', '.join(missing_redaction)}")
    if not isinstance(redaction["marker"], str) or not redaction["marker"]:
        raise SystemExit("가린 자리에 넣는 표시는 비어 있지 않은 문자열 하나다")
    if empty_redaction_words:
        raise SystemExit(
            f"가릴 낱말이 비어 있으면 규칙이 아무것도 가리지 못한다 — {', '.join(empty_redaction_words)}"
        )
    if missing_suspect_span:
        raise SystemExit(
            "걸린 자리가 어디까지인지 정해야 두 축이 같게 가린다 — "
            f"{', '.join(missing_suspect_span)} 가 없다"
        )
    if missing_trailing_body:
        raise SystemExit(
            "값 쪽 낱말은 뒤에 이어질 몸통의 조건을 함께 적어야 한다 — "
            f"{', '.join(missing_trailing_body)} 가 없다"
        )
    if missing_stages:
        places = " · ".join(REDACTION_STAGES)
        raise SystemExit(
            f"가리는 자리 {places} 가 다 있어야 한다 — {', '.join(missing_stages)} 가 없다"
        )
    if stray_on_suspect:
        actions = " 이나 ".join(ON_SUSPECT_ACTIONS)
        raise SystemExit(
            f"자리마다 {actions} 를 하나 골라야 한다 — {', '.join(stray_on_suspect)}"
        )
    if not trace_attributes:
        raise SystemExit("추적이 나르는 속성을 계약이 하나도 선언하지 않는다")
    if retired_attributes:
        raise SystemExit(
            f"실행에 자리가 없는 이름이 추적 속성 표에 있다 — {', '.join(retired_attributes)}"
        )

    declared_routes = read_agent_api_routes()
    recorded_unserved = [
        prefix
        for item in read_case("divergence")["items"]
        for prefix in item.get("unservedPaths", [])
    ]
    base_url = sys.argv[1] if len(sys.argv) > 1 else None
    if base_url is not None:
        served = read_served_routes(base_url)
        unserved = [
            route
            for route in declared_routes
            if route_key(route) not in served
            and not any(route["path"].startswith(prefix) for prefix in recorded_unserved)
        ]
        if unserved:
            detail = ", ".join(route_key(route) for route in unserved)
            raise SystemExit(f"계약이 선언한 창구에 서버가 없다 — {detail}")
        skipped = ", ".join(recorded_unserved) or "없음"
        print(
            f"{base_url} 가 계약의 창구 {len(declared_routes)}자리를 연다 — "
            f"갈라짐으로 적힌 {skipped} 은 묻지 않는다"
        )

    names = ", ".join(topic["name"] for topic in topics.values())
    print(f"계약 {version}: 케이스 {len(cases)}개를 읽었다 — {', '.join(cases)}")
    print(f"에이전트 {len(AGENTS)}개의 계약 파일 {agent_file_count}개를 읽었다")
    print(f"강제 {len(grouped['enforced'])}자리, 기록 {len(grouped['recorded'])}자리")
    print(f"도구 {len(bindings)}개가 부르는 경로를 HTTP 표면 {len(declared_paths)}자리가 덮는다")
    print(
        f"접수가 받는 잡 종류 {len(intake_kinds)}개를 세 자리가 같게 적는다 — {', '.join(intake_kinds)}"
    )
    print(f"서비스를 넘는 토픽 {len(topics)}개를 선언한다 — {names}")
    print(f"실행 스트림 절의 자리 {STREAM_PLACES}개를 대조한다")
    print(f"축의 이름 {len(axis)}개를 계약이 한 벌로 갖는다 — {', '.join(axis)}")
    print(f"축의 이름을 담을 수 있는 자리 {len(axis_surfaces)}개가 그 둘만 쓴다")
    surface_counts = " · ".join(f"{name} {len(tool_surfaces[name])}" for name in TOOL_SURFACES)
    print(f"도구 {len(TOOL_SURFACES)} 표면이 열리는 도구를 나눈다 — {surface_counts}")
    print(f"잡 원장이 축의 칸을 갖는다 — {axis_column}")
    print(
        "대화 실행의 대기 줄은 원장이 갖고 축으로 갈린다 — "
        f"시그널 {', '.join(thread_queue['signalArgs'])} · "
        f"액티비티 {', '.join(thread_queue['activities'])}"
    )
    print(
        f"워커 SDK 지표 창구는 포트 {worker_metrics['port']} 를 열고 "
        f"{worker_metrics['durationUnit']} 단위로 낸다"
    )
    print(f"축의 라벨은 계측에서 {attribute_key} 이고 창구에서 {label_name} 이다")
    shaped = ", ".join(f"{name} {str(worker_metrics[name]).lower()}" for name in NAME_SUFFIXES)
    print(f"지표의 이름을 빚는 값 {len(NAME_SUFFIXES)}개를 계약이 적는다 — {shaped}")
    print(
        f"가리는 규칙은 key 낱말 {len(redaction_words['keys'])}개와 "
        f"값의 모양 {len(redaction_words['values'])}개를 {redaction['marker']} 로 바꾼다"
    )
    chosen = ", ".join(f"{name} {stages[name]['onSuspect']}" for name in REDACTION_STAGES)
    print(f"가리는 자리 {len(REDACTION_STAGES)}개가 걸린 것을 어떻게 할지 적는다 — {chosen}")
    settlement = read_settlement()
    missing_settlement = [place for place in SETTLEMENT_PLACES if place not in settlement]
    if missing_settlement:
        raise SystemExit(
            f"실행을 접는 조건에 있어야 할 자리가 없다 — {', '.join(missing_settlement)}"
        )
    provider_request = read_identifier_rules().get("providerRequestId", {})
    missing_provider_request = [rule for rule in PROVIDER_REQUEST_RULES if rule not in provider_request]
    if missing_provider_request:
        raise SystemExit(
            "공급자 요청 식별자의 값 규칙에 있어야 할 자리가 없다 — "
            f"{', '.join(missing_provider_request)}"
        )
    ttft = read_run_observation_rules().get("ttftMs", {})
    missing_ttft = [rule for rule in TTFT_RULES if rule not in ttft]
    if missing_ttft:
        raise SystemExit(
            f"첫 토큰까지의 시간에 관한 규칙에 있어야 할 자리가 없다 — {', '.join(missing_ttft)}"
        )
    turn_ledger = read_shared("execution.budget.json").get("turnLedger", {})
    missing_ledger = [place for place in TURN_LEDGER_PLACES if place not in turn_ledger]
    if missing_ledger:
        raise SystemExit(f"턴 원장에 있어야 할 자리가 없다 — {', '.join(missing_ledger)}")
    pacing = read_shared("execution.budget.json").get("pacing", {})
    missing_pacing = [place for place in PACING_PLACES if place not in pacing]
    if missing_pacing:
        raise SystemExit(f"예산 페이싱에 있어야 할 자리가 없다 — {', '.join(missing_pacing)}")
    missing_notice = [place for place in PROGRESS_NOTICE_PLACES if place not in pacing["progressNotice"]]
    if missing_notice:
        raise SystemExit(f"남은 몫 통지에 있어야 할 자리가 없다 — {', '.join(missing_notice)}")
    missing_landing = [place for place in LANDING_DIRECTIVE_PLACES if place not in pacing["landingDirective"]]
    if missing_landing:
        raise SystemExit(f"마무리 지시에 있어야 할 자리가 없다 — {', '.join(missing_landing)}")
    template = pacing["progressNotice"]["template"]
    missing_slots = [
        slot for slot in pacing["progressNotice"]["placeholders"] if "{" + slot + "}" not in template
    ]
    if missing_slots:
        raise SystemExit(f"남은 몫 통지의 문구가 채울 자리를 갖지 않는다 — {', '.join(missing_slots)}")
    intake = read_case("job.intake")
    credential_check = intake.get("credentialCheck", {})
    missing_credential = [place for place in CREDENTIAL_CHECK_PLACES if place not in credential_check]
    if missing_credential:
        raise SystemExit(
            f"접수의 자격 검사에 있어야 할 자리가 없다 — {', '.join(missing_credential)}"
        )
    rejection_codes = [rejection["code"] for rejection in intake["rejections"]]
    if credential_check["rejection"] not in rejection_codes:
        raise SystemExit(
            f"접수의 자격 검사가 내는 {credential_check['rejection']} 를 거절 목록이 갖지 않는다"
        )
    job_results = intake.get("results", {})
    missing_result_places = [place for place in RESULT_PLACES if place not in job_results]
    if missing_result_places:
        raise SystemExit(f"잡 산출 선언에 있어야 할 자리가 없다 — {', '.join(missing_result_places)}")
    for kind, declared in job_results["byKind"].items():
        if kind not in intake["kinds"]:
            raise SystemExit(f"산출을 적은 {kind} 를 접수가 받지 않는다")
        if not declared.get("required"):
            raise SystemExit(f"{kind} 의 산출이 실어야 할 칸을 적지 않는다")
        from_output = declared.get("fromAgentOutput", [])
        output = (
            read_agent_output(kind.replace(".", "-"))["schema"].get("properties", {})
            if from_output
            else {}
        )
        stray = [field for field in from_output if field not in output]
        if stray:
            raise SystemExit(
                f"{kind} 의 산출이 에이전트가 내지 않는 {', '.join(stray)} 를 실으라고 적는다"
            )
        unrequired = [field for field in from_output if field not in declared["required"]]
        if unrequired:
            raise SystemExit(f"{kind} 의 산출이 {', '.join(unrequired)} 를 실으면서 요구하지 않는다")
    scope_token = read_scope_token()
    missing_scope = [place for place in SCOPE_TOKEN_PLACES if place not in scope_token]
    if missing_scope:
        raise SystemExit(f"실행 자격의 모양에 있어야 할 자리가 없다 — {', '.join(missing_scope)}")
    setting_inputs = read_shared("settings.execution.json")["inputs"]
    setting_keys = read_openapi_enum("SettingKey")
    for field, declared in setting_inputs.items():
        if declared["setting"] not in setting_keys:
            raise SystemExit(f"{field} 이 설정 표에 없는 {declared['setting']} 을 읽으라고 적는다")
        stray_kinds = [kind for kind in declared["kinds"] if kind not in intake_kinds]
        if stray_kinds:
            raise SystemExit(
                f"{field} 이 접수가 받지 않는 종류 {', '.join(stray_kinds)} 에 실린다고 적는다"
            )
        stray_request = [kind for kind in declared.get("requestField", {}) if kind not in declared["kinds"]]
        if stray_request:
            raise SystemExit(
                f"{field} 이 싣지 않는 종류 {', '.join(stray_request)} 의 요청 칸을 적는다"
            )
    language_input = setting_inputs["language"]
    if language_input["default"] not in read_shared("languages.json")["languages"]:
        raise SystemExit(f"기본 출력 언어 {language_input['default']} 가 언어 목록에 없다")
    language_scope = read_shared("languages.json")["scope"]
    unread_language = [
        kind
        for kind, declared in read_json("wire/job.kinds.json")["kinds"].items()
        if declared["agent"] in language_scope and kind not in language_input["kinds"]
    ]
    if unread_language:
        raise SystemExit(
            f"언어를 적용할 범위가 있는 종류가 설정을 읽지 않는다 — {', '.join(unread_language)}"
        )
    envelope_settings = read_shared("settings.execution.json")["envelope"]
    carried_envelope = {
        field: declared for field, declared in envelope_settings.items() if isinstance(declared, dict)
    }
    for field, declared in carried_envelope.items():
        if declared["setting"] not in setting_keys:
            raise SystemExit(f"봉투의 {field} 이 설정 표에 없는 {declared['setting']} 을 읽으라고 적는다")
        overlap = [kept for kept in declared["keeps"] if kept == declared["overrides"]]
        if overlap:
            raise SystemExit(f"봉투의 {field} 이 {declared['overrides']} 를 덮으면서 그대로 둔다고도 적는다")
        stray_kinds = [kind for kind in declared["kinds"] if kind not in intake_kinds]
        if stray_kinds:
            raise SystemExit(
                f"봉투의 {field} 이 접수가 받지 않는 종류 {', '.join(stray_kinds)} 에 실린다고 적는다"
            )
    print(f"실행을 접는 조건 {len(SETTLEMENT_PLACES)}개를 계약이 갖는다")
    print(f"공급자 요청 식별자의 값 규칙 {len(PROVIDER_REQUEST_RULES)}개를 계약이 갖는다")
    print(f"첫 토큰까지의 시간에 관한 규칙 {len(TTFT_RULES)}개를 계약이 갖는다")
    print(f"접수의 자격 검사에 관한 자리 {len(CREDENTIAL_CHECK_PLACES)}개를 계약이 갖는다")
    print(f"잡 산출의 칸을 적은 종류 {len(job_results['byKind'])}개 — {', '.join(job_results['byKind'])}")
    print(f"예산 페이싱에 관한 자리 {len(PACING_PLACES)}개를 계약이 갖는다")
    print(f"턴 원장의 정산 규칙 {len(TURN_LEDGER_PLACES)}개를 계약이 갖는다")
    print(
        f"실행에 매인 자격은 {scope_token['prefix']} 로 시작해 "
        f"{len(scope_token['payload']['fields'])}개 칸을 "
        f"{scope_token['signature']['algorithm']} 으로 서명한다"
    )
    # 두 층이 같은 수를 쓰면 한쪽을 고칠 때 다른 쪽이 따라 움직이므로 자리가 나뉘어 있는지 본다.
    runner_retry = read_shared("execution.budget.json")["runnerRetry"]
    for layer in ("transient", "schemaViolation"):
        if not isinstance(runner_retry.get(layer, {}).get("attempts"), int):
            raise SystemExit(f"실행기 재시도의 {layer} 층이 횟수를 적지 않는다")
    if not runner_retry["schemaViolation"]["directive"].strip():
        raise SystemExit("규격을 어긴 산출을 되받는 지시가 비어 있다")

    # 재생 상한이 요약 트리거보다 작으면 정상 흐름이 늘 상한에 닿아 신호가 되지 못한다.
    chat_summary = read_json("agent/chat/summary.json")
    if chat_summary["consumption"]["maxReplayMessages"] <= chat_summary["production"]["trigger"]["messages"]:
        raise SystemExit(
            f"재생 상한 {chat_summary['consumption']['maxReplayMessages']} 가 요약 트리거 "
            f"{chat_summary['production']['trigger']['messages']} 보다 넉넉하지 않다"
        )

    # 도구 인자의 상한은 스키마가 강제하지 못하므로 설명에 그 수가 있어야 모델에게 닿는다.
    silent_arg_limits = [
        f"{agent}.{tool}.{name}"
        for agent in AGENTS
        for tool, declared in (read_agent_tools(agent).get("tools") or {}).items()
        for name, arg in (declared.get("args") or {}).items()
        if isinstance(arg, dict)
        and isinstance(arg.get("maxLength"), int)
        and str(arg["maxLength"]) not in str(arg.get("description", ""))
    ]
    if silent_arg_limits:
        raise SystemExit(
            f"도구 인자의 상한이 설명에 없어 모델에게 닿지 않는다 — {', '.join(silent_arg_limits)}"
        )

    # 보고의 칸 목록은 두 축이 자기 모양을 대조하는 자리이므로 없어지면 그 대조가 조용히 사라진다.
    for agent in AGENTS:
        report = (read_agent_tools(agent).get("orchestration") or {}).get("workerReport")
        if report is None:
            continue
        named = [
            key
            for key, value in report.items()
            if key.lower().endswith("required") and isinstance(value, list) and value
        ]
        if not named:
            raise SystemExit(f"{agent} 의 전문가 보고가 채워야 할 칸을 하나도 적지 않는다")

    # 모델에게 알린 상한과 실제로 주는 몫의 최댓값이 갈리면 상한을 알려 주는 목적 자체가 사라진다.
    depth_names = ["shallow", "normal", "deep"]
    for agent in AGENTS:
        orchestration = read_agent_tools(agent).get("orchestration") or {}
        if "workerMaxTurns" not in orchestration:
            continue
        shares = next(
            (
                value
                for value in orchestration.values()
                if isinstance(value, dict) and all(name in value for name in depth_names)
            ),
            None,
        )
        if shares is None:
            raise SystemExit(f"{agent} 이 전문가 몫을 적지 않고 상한만 알린다")
        largest = max(shares[name] for name in depth_names)
        if largest != orchestration["workerMaxTurns"]:
            raise SystemExit(
                f"{agent} 이 모델에게 알린 상한 {orchestration['workerMaxTurns']} 와 "
                f"가장 깊은 몫 {largest} 가 다르다"
            )

    execution_limits = read_shared("execution.limits.json")["kinds"]
    limit_kinds = sorted(execution_limits)
    if limit_kinds != sorted(AGENTS):
        raise SystemExit(f"실행 한도를 적은 종류가 에이전트 목록과 다르다 — {', '.join(limit_kinds)}")

    model_rates = read_shared("model.rates.json")
    unpriced_models = [
        f"{kind}: {model}"
        for kind, limits in execution_limits.items()
        for model in (limits.get("defaultModel"), limits.get("fallbackModel"), *limits["allowedModels"])
        if model is not None and model not in model_rates["base"]
    ]
    if unpriced_models:
        raise SystemExit(f"실행 한도가 단가를 모르는 모델을 가리킨다 — {', '.join(unpriced_models)}")
    model_envelope = read_shared("execution.limits.json")["modelEnvelope"]
    envelope_models = sorted(k for k in model_envelope if k not in ("meaning", "appliesToReason"))
    shared_budget = sorted(read_shared("model.envelope.json").get("sharedOutputBudget", {}).get("appliesTo", []))
    if envelope_models != shared_budget:
        raise SystemExit(
            f"모델 봉투를 덮는 모델이 출력 예산을 나눠 쓰는 모델과 다르다 — {', '.join(envelope_models)}"
        )

    # 허용 목록 밖의 모델을 기본으로 두면 그 종류는 자기가 거절하는 값으로 실행한다.
    disallowed_defaults = [
        f"{kind}: {model}"
        for kind, limits in execution_limits.items()
        for model in (limits.get("defaultModel"), limits.get("fallbackModel"))
        if model is not None and model not in limits["allowedModels"]
    ]
    if disallowed_defaults:
        raise SystemExit(
            f"실행 한도가 허용하지 않은 모델을 기본이나 대체로 둔다 — {', '.join(disallowed_defaults)}"
        )
    cache = model_rates["cache"]
    if cache["defaultTtl"] not in cache["writeMultiplier"]:
        raise SystemExit(f"기본 캐시 수명 {cache['defaultTtl']} 의 배수를 계약이 적지 않는다")
    for model, rate in model_rates["base"].items():
        if rate["input"] <= 0 or rate["output"] <= 0:
            raise SystemExit(f"{model} 의 단가가 0 이하라 예산을 집행할 수 없다")
    unpriced_models = [
        model
        for model in read_shared("model.envelope.json").get("sharedOutputBudget", {}).get("appliesTo", [])
        if model not in model_rates["base"]
    ]
    if unpriced_models:
        raise SystemExit(f"봉투가 이름으로 가리키나 단가를 적지 않은 모델이 있다 — {', '.join(unpriced_models)}")

    carried = " · ".join(f"{field} ← {declared['setting']}" for field, declared in setting_inputs.items())
    print(f"설정이 실행 입력에 실리는 자리 {len(setting_inputs)}개를 계약이 갖는다 — {carried}")
    overridden = " · ".join(
        f"{declared['overrides']} ← {declared['setting']}" for declared in carried_envelope.values()
    )
    print(f"설정이 봉투를 덮는 자리 {len(carried_envelope)}개를 계약이 갖는다 — {overridden}")
    limits_named = " · ".join(f"{kind}({execution_limits[kind]['maxTurns']}턴)" for kind in limit_kinds)
    print(f"실행 한도를 계약이 갖는 종류 {len(limit_kinds)}개 — {limits_named}")
    print(
        f"단가를 아는 모델 {len(model_rates['base'])}개와 캐시 수명 "
        f"{len(cache['writeMultiplier'])}개를 계약이 갖는다 — "
        f"기본 수명 {cache['defaultTtl']} 의 쓰기 배수는 {cache['writeMultiplier'][cache['defaultTtl']]} 다"
    )

    # 레시피와 정리 제안의 원장이 에이전트 원장에 서지 않으면 새 창구가 읽을 자리가 없다.
    ledger_tables = read_ledger_tables()
    missing_ledger_tables = [name for name in LEDGER_TABLES if name not in ledger_tables]
    if missing_ledger_tables:
        raise SystemExit(f"창구가 읽는 표를 migration 이 세우지 않는다 — {', '.join(missing_ledger_tables)}")

    search_index = read_search_index("recipes")
    missing_search_index = [place for place in SEARCH_INDEX_PLACES if place not in search_index]
    if missing_search_index:
        raise SystemExit(f"검색 색인 선언에 있어야 할 자리가 없다 — {', '.join(missing_search_index)}")
    document_fields = list(search_index["document"]["fields"])
    match_fields = search_index["query"]["matchFields"]
    stray_match_fields = [name for name in match_fields if name not in document_fields]
    if stray_match_fields:
        raise SystemExit(
            f"검색이 색인 문서에 없는 칸을 뒤진다고 적는다 — {', '.join(stray_match_fields)}"
        )
    outbox_target = read_search_outbox_target()
    declared_target = read_json("wire/search.index.json")["pipeline"]["outboxTarget"]
    if outbox_target != declared_target:
        raise SystemExit(
            f"아웃박스가 받는 대상을 계약과 migration 이 다르게 적는다 — "
            f"계약은 {declared_target} 이고 migration 은 {outbox_target or '제약 없음'} 이다"
        )

    ledger_case = read_case("recipe.ledger")
    # 적중이 색인에 없는 칸을 싣겠다고 적으면 그 칸은 언제나 비어서 온다.
    unbacked_hit_fields = [
        name
        for name in ledger_case["shapes"]["recipeSearchHit"]["fields"]
        if name not in HIT_FIELDS_OUTSIDE_DOCUMENT and name not in document_fields
    ]
    if unbacked_hit_fields:
        raise SystemExit(
            f"얇은 적중이 색인 문서에 없는 칸을 싣는다고 적는다 — {', '.join(unbacked_hit_fields)}"
        )

    # 케이스가 적은 창구를 HTTP 표면이 열지 않으면 그 케이스는 아무것도 대조하지 않는다.
    agent_route_keys = {route_key(route) for route in declared_routes}
    unopened_windows = [
        key
        for key in (route_key(window) for window in ledger_case["windows"])
        if key not in agent_route_keys
    ]
    if unopened_windows:
        raise SystemExit(
            f"케이스가 적은 창구를 에이전트 표면이 선언하지 않는다 — {', '.join(unopened_windows)}"
        )

    archive_case = read_case("cleanup.archive")
    archive_window = archive_case["surfaces"]["archive"]
    if normalize_path_template(archive_window["path"]) not in declared_paths:
        raise SystemExit(
            f"조건부 보관이 부르는 경로를 어느 HTTP 표면도 선언하지 않는다 — {archive_window['path']}"
        )
    # 두 케이스가 같은 거절을 다른 낱말로 적으면 부른 쪽이 한쪽만 알아본다.
    rejection_codes = [rejection["code"] for rejection in ledger_case["rejections"]]
    if archive_case["rejection"]["code"] not in rejection_codes:
        raise SystemExit(
            f"조건부 보관이 내는 {archive_case['rejection']['code']} 를 원장 케이스의 거절 목록이 갖지 않는다"
        )
    stray_transition_rejections = [
        f"{action} 의 {declared['rejection']}"
        for action, declared in ledger_case["transitions"]["recipe"].items()
        if "rejection" in declared and declared["rejection"] not in rejection_codes
    ]
    if stray_transition_rejections:
        raise SystemExit(
            f"상태 전이가 거절 목록에 없는 코드를 낸다 — {', '.join(stray_transition_rejections)}"
        )

    # 낡음 판정을 글로만 적으면 두 축이 경계에서 갈리므로 사례의 답을 비교 규칙으로 다시 센다.
    wrong_stale_cases = [
        one["name"]
        for one in archive_case["condition"]["cases"]
        if has_activity_since(one["lastEventAt"], one["ifNoActivitySince"]) != one["hasActivity"]
    ]
    if wrong_stale_cases:
        raise SystemExit(
            f"낡음 판정의 사례가 비교 규칙과 다른 답을 적는다 — {' · '.join(wrong_stale_cases)}"
        )

    print(
        f"레시피와 정리의 원장 표 {len(LEDGER_TABLES)}개를 migration 이 세운다 — "
        f"{', '.join(LEDGER_TABLES)}"
    )
    print(
        f"검색 색인 {search_index['alias']} 는 문서의 칸 {len(document_fields)}개를 갖고 "
        f"그중 {len(match_fields)}개를 뒤진다"
    )
    print(f"색인 아웃박스가 받는 대상은 {outbox_target} 하나이며 migration 이 그 값만 받는다")
    print(f"레시피와 정리의 창구 {len(ledger_case['windows'])}자리를 케이스와 에이전트 표면이 같게 적는다")
    print(f"낡음 판정의 사례 {len(archive_case['condition']['cases'])}개가 비교 규칙과 같은 답을 낸다")

    # 적용 이력이 사건에서도 오므로 그 사건을 읽는 자리를 계약이 갖지 않으면 한 축만 그 행을 만든다.
    projection_case = read_case("recipe.projection")
    ledger_topic = read_json("wire/topics.json")["ledgerEvents"]
    if projection_case["source"]["topic"] != ledger_topic["name"]:
        raise SystemExit(
            f"프로젝터가 읽는 토픽을 케이스와 토픽 선언이 다르게 적는다 — "
            f"케이스는 {projection_case['source']['topic']} 이고 선언은 {ledger_topic['name']} 이다"
        )
    agent_group = ledger_topic["consumerGroups"]["agentProjector"]
    if projection_case["source"]["consumerGroup"] != agent_group:
        raise SystemExit(
            f"에이전트 프로젝터의 소비자 그룹을 케이스와 토픽 선언이 다르게 적는다 — "
            f"케이스는 {projection_case['source']['consumerGroup']} 이고 선언은 {agent_group} 이다"
        )
    missing_guards = [name for name in PROJECTION_GUARDS if name not in projection_case["guards"]]
    if missing_guards:
        raise SystemExit(f"투영이 행을 만들지 않는 자리에 있어야 할 것이 없다 — {', '.join(missing_guards)}")
    # 투영이 원장에 없는 칸에 쓰겠다고 적으면 그 축은 첫 사건에서 무너진다.
    mapping = projection_case["mapping"]
    application_columns = read_table_columns(mapping["table"])
    stray_columns = [name for name in mapping["columns"] if name not in application_columns]
    if stray_columns:
        raise SystemExit(
            f"투영이 {mapping['table']} 에 없는 칸에 쓴다고 적는다 — {', '.join(stray_columns)}"
        )
    unmapped_columns = [name for name in application_columns if name not in mapping["columns"]]
    if unmapped_columns:
        raise SystemExit(
            f"투영이 {mapping['table']} 의 칸을 무엇으로 채우는지 적지 않는다 — {', '.join(unmapped_columns)}"
        )

    # 상류가 없으면 빠져야 하는 도구를 표면이 표시하지 않으면 플러그인이 그 목록을 손으로 적는다.
    mcp_tools = read_mcp_tool_names()
    if mcp_tools != MCP_AGENT_TOOLS:
        raise SystemExit(
            f"에이전트 표면을 부르는 MCP 도구의 표시가 계약과 다르다 — "
            f"{', '.join(MCP_AGENT_TOOLS)} 여야 하는데 {', '.join(mcp_tools) or '없음'} 다"
        )

    print(
        f"에이전트 프로젝터는 {projection_case['source']['topic']} 를 "
        f"{projection_case['source']['consumerGroup']} 으로 읽어 "
        f"{projection_case['selection']['kind']} 하나를 {mapping['table']} 의 "
        f"칸 {len(application_columns)}개로 옮긴다"
    )
    print(
        f"에이전트 상류가 있어야 서는 MCP 도구 {len(mcp_tools)}개를 표면이 표시한다 — "
        f"{', '.join(mcp_tools)}"
    )


if __name__ == "__main__":
    main()
