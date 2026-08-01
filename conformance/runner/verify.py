"""로더가 계약 파일과 케이스를 읽어 낼 수 있고 자리마다 강제와 기록이 정해졌는지 확인한다."""

from __future__ import annotations

import json
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
    read_job_ledger_axis_column,
    read_json,
    read_openapi_enum,
    read_text,
    read_tool_binding_paths,
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
    "http/agent-api.openapi.yaml",
    "http/tracer-dependency.openapi.yaml",
]
AXIS_VALUES = ["ts", "python"]
NON_AXIS_WORDS = ["claude-sdk", "typescript"]
AXIS_DURATION_UNIT = "seconds"


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
    worker_metrics = read_worker_sdk_metrics()

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
    if worker_metrics["port"] is None or worker_metrics["durationUnit"] != AXIS_DURATION_UNIT:
        port = worker_metrics["port"] or "없음"
        unit = worker_metrics["durationUnit"] or "없음"
        raise SystemExit(
            f"워커 지표 창구는 포트와 {AXIS_DURATION_UNIT} 단위를 함께 적어야 한다 — "
            f"포트 {port}, 단위 {unit}"
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
    print(f"잡 원장이 축의 칸을 갖는다 — {axis_column}")
    print(
        f"워커 SDK 지표 창구는 포트 {worker_metrics['port']} 를 열고 "
        f"{worker_metrics['durationUnit']} 단위로 낸다"
    )


if __name__ == "__main__":
    main()
