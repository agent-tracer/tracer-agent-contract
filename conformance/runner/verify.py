"""로더가 계약 파일과 케이스를 전부 읽어 낼 수 있는지 확인한다."""

from __future__ import annotations

from contract import list_cases, read_agent_spec, read_case, read_json, read_version

AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"]
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


def main() -> None:
    version = read_version()
    cases = list_cases()

    for name in cases:
        read_case(name)
    for agent in AGENTS:
        read_agent_spec(agent)
    for file_name in SHARED:
        read_json(f"agent/shared/{file_name}")
    for file_name in WIRE:
        read_json(f"wire/{file_name}")

    if not cases:
        raise SystemExit("적합성 케이스가 하나도 없다")

    print(f"계약 {version}: 케이스 {len(cases)}개를 읽었다 — {', '.join(cases)}")


if __name__ == "__main__":
    main()
