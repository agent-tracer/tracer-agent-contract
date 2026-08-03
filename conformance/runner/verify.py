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
    read_openapi_enum,
    read_redaction,
    read_scope_token,
    read_shared,
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

AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"]
SHARED = [
    "languages.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "execution.budget.json",
    "model.envelope.json",
    "redaction.json",
    "scope.token.json",
]
WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"]
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
    "resendIntervalMs",
    "headers",
]
STREAM_NESTED = {
    "replay": ["mode", "lastEventId", "reason"],
    "reconnect": ["initialBackoffMs", "maxBackoffMs", "resetOn", "stopOn"],
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
PROVIDER_REQUEST_RULES = ["unit", "source", "absent", "notSession", "manyCalls"]
TTFT_RULES = ["unit", "source", "absent", "notDuration", "noEstimate"]
CREDENTIAL_CHECK_PLACES = ["meaning", "appliesTo", "rejection", "reason", "notEnvelope"]
PACING_PLACES = ["meaning", "unit", "progressNotice", "landingDirective"]
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
    print(f"추적이 나르는 속성 {len(trace_attributes)}개를 계약이 갖는다")
    scope_token = read_scope_token()
    missing_scope = [place for place in SCOPE_TOKEN_PLACES if place not in scope_token]
    if missing_scope:
        raise SystemExit(f"실행 자격의 모양에 있어야 할 자리가 없다 — {', '.join(missing_scope)}")
    print(f"실행을 접는 조건 {len(SETTLEMENT_PLACES)}개를 계약이 갖는다")
    print(f"공급자 요청 식별자의 값 규칙 {len(PROVIDER_REQUEST_RULES)}개를 계약이 갖는다")
    print(f"첫 토큰까지의 시간에 관한 규칙 {len(TTFT_RULES)}개를 계약이 갖는다")
    print(f"접수의 자격 검사에 관한 자리 {len(CREDENTIAL_CHECK_PLACES)}개를 계약이 갖는다")
    print(f"예산 페이싱에 관한 자리 {len(PACING_PLACES)}개를 계약이 갖는다")
    print(
        f"실행에 매인 자격은 {scope_token['prefix']} 로 시작해 "
        f"{len(scope_token['payload']['fields'])}개 칸을 "
        f"{scope_token['signature']['algorithm']} 으로 서명한다"
    )


if __name__ == "__main__":
    main()
