"""로더가 계약 파일과 케이스를 읽어 낼 수 있고 자리마다 강제와 기록이 정해졌는지 확인한다."""

from __future__ import annotations

from contract import (
    enforcement_level,
    list_cases,
    normalize_path_template,
    read_case,
    read_declared_http_paths,
    read_json,
    read_tool_binding_paths,
    read_version,
)

AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"]
SECTIONS = ["tools", "output", "bindings", "prompt"]
SHARED = [
    "language.directives.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "prompt.fragment.integrity.json",
    "prompt.placeholders.json",
    "prompt.fragment.manifest.json",
    "evaluation.example.contract.json",
]
WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"]
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

    declared_paths = set(read_declared_http_paths())
    bindings = read_tool_binding_paths()
    unmet = [
        binding
        for binding in bindings
        if normalize_path_template(binding["path"]) not in declared_paths
    ]

    if not cases:
        raise SystemExit("적합성 케이스가 하나도 없다")
    if grouped["unclassified"]:
        unclassified = ", ".join(grouped["unclassified"])
        raise SystemExit(f"강제인지 기록인지 정해지지 않은 자리가 있다 — {unclassified}")
    if unmet:
        detail = ", ".join(f"{binding['name']} {binding['path']}" for binding in unmet)
        raise SystemExit(f"도구가 부르는 경로를 어느 HTTP 표면도 선언하지 않는다 — {detail}")

    print(f"계약 {version}: 케이스 {len(cases)}개를 읽었다 — {', '.join(cases)}")
    print(f"강제 {len(grouped['enforced'])}자리, 기록 {len(grouped['recorded'])}자리")
    print(f"도구 {len(bindings)}개가 부르는 경로를 HTTP 표면 {len(declared_paths)}자리가 덮는다")


if __name__ == "__main__":
    main()
