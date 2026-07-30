"""로더가 계약 파일과 케이스를 읽어 낼 수 있고 자리마다 강제와 기록이 정해졌는지 확인한다."""

from __future__ import annotations

import json
import sys
import urllib.request

from contract import (
    enforcement_level,
    list_cases,
    normalize_path_template,
    read_agent_api_routes,
    read_case,
    read_declared_http_paths,
    read_json,
    read_openapi_enum,
    read_tool_binding_paths,
    read_version,
    route_key,
)

SURFACE_PATH = "/internal/surface"


def read_served_routes(base_url: str) -> set[str]:
    """도는 서버가 자기 라우팅 표를 그대로 내므로 그것을 계약이 선언한 창구와 대조한다."""
    with urllib.request.urlopen(base_url.rstrip("/") + SURFACE_PATH) as response:
        body = json.loads(response.read().decode("utf-8"))
    return {route_key(route) for route in body["data"]["routes"]}

AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"]
SECTIONS = ["tools", "output", "bindings", "prompt"]
SHARED = [
    "language.directives.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "prompt.fragment.integrity.json",
    "prompt.fragment.registry.json",
    "prompt.placeholders.json",
    "prompt.fragment.manifest.json",
    "evaluation.example.contract.json",
]
WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"]
TOPIC_FIELDS = ["name", "key", "payload", "delivery"]
FRAGMENT_SURFACES = ["registerAndResolve", "registerCandidate", "promote"]
STANDALONE = [
    "workflow/queues.yaml",
    "http/agent-api.openapi.yaml",
    "http/tracer-dependency.openapi.yaml",
]


def main() -> None:
    version = read_version()
    cases = list_cases()
    surfaces: list[str] = []

    for name in cases:
        read_case(name)
        surfaces.append(f"conformance/cases/{name}.json")

    for agent in AGENTS:
        spec = read_json(f"agent/{agent}/spec.json")
        surfaces.extend(f"agent/{agent}/spec.json#{section}" for section in SECTIONS if section in spec)
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

    registry = read_json("agent/shared/prompt.fragment.registry.json")
    identity = registry["identity"]
    declared_channels = list(registry["channels"])
    unseen_channels = [
        channel
        for channel in declared_channels
        if channel not in registry["profileChannels"].values()
        and channel not in registry["promotionPath"]
    ]
    unmapped_profiles = [
        profile
        for profile, channel in registry["profileChannels"].items()
        if channel not in declared_channels
    ]
    missing_surfaces = [name for name in FRAGMENT_SURFACES if name not in registry["surfaces"]]
    prefixed_keys = [
        value
        for value in (
            identity["definitionKey"]["example"],
            identity["codeName"]["example"],
            identity["templateKey"]["example"],
        )
        if any(value.startswith(prefix) for prefix in identity["rejectedPrefixes"])
    ]

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

    gated_channel = registry["promotionPath"][-1]
    ungated_channels = registry["promotionGate"]["ungatedChannels"]
    gate_mismatch = gated_channel in ungated_channels or any(
        channel not in ungated_channels for channel in registry["promotionPath"][:-1]
    )

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
    if unmapped_profiles:
        raise SystemExit(f"profile 이 선언되지 않은 조각 채널을 본다 — {', '.join(unmapped_profiles)}")
    if unseen_channels:
        raise SystemExit(f"어느 profile 도 승격 경로도 닿지 않는 조각 채널이 있다 — {', '.join(unseen_channels)}")
    if missing_surfaces:
        raise SystemExit(f"조각 쓰기 경로의 창구가 선언되지 않았다 — {', '.join(missing_surfaces)}")
    if gate_mismatch:
        path_text = " → ".join(registry["promotionPath"])
        ungated_text = ", ".join(ungated_channels)
        raise SystemExit(
            f"승격 경로의 마지막 채널만 게이트를 가져야 한다 — 경로 {path_text} · "
            f"게이트 없는 채널 {ungated_text}"
        )
    if prefixed_keys:
        raise SystemExit(f"조각의 이름이 구현체를 말하는 접두사를 달고 있다 — {', '.join(prefixed_keys)}")
    if kind_mismatch:
        detail = " · ".join(f"{where} 는 {', '.join(values)}" for where, values in kind_mismatch)
        raise SystemExit(
            f"접수가 받는 잡 종류가 자리마다 다르다 — job.intake 는 {', '.join(intake_kinds)} 인데 {detail}"
        )
    if incomplete_topics:
        fields = " · ".join(TOPIC_FIELDS)
        raise SystemExit(f"토픽 선언에 {fields} 가 다 있어야 한다 — {', '.join(incomplete_topics)}")

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
    print(f"강제 {len(grouped['enforced'])}자리, 기록 {len(grouped['recorded'])}자리")
    print(f"도구 {len(bindings)}개가 부르는 경로를 HTTP 표면 {len(declared_paths)}자리가 덮는다")
    print(
        f"접수가 받는 잡 종류 {len(intake_kinds)}개를 세 자리가 같게 적는다 — {', '.join(intake_kinds)}"
    )
    print(
        f"조각 채널 {len(declared_channels)}개를 profile {len(registry['profileChannels'])}개가 나눠 보고 "
        f"판이 어긋나면 {registry['drift']['policy']} 하며 "
        f"{gated_channel} 승격이 {registry['promotionGate']['policy']} 를 지난다"
    )
    print(f"서비스를 넘는 토픽 {len(topics)}개를 선언한다 — {names}")


if __name__ == "__main__":
    main()
