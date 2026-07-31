#!/usr/bin/env python3
"""계약의 YAML 이 문법상 읽히고 워크플로가 실제로 폴링되는 큐에 놓였는지 검사한다."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
QUEUES = "workflow/queues.yaml"


def tracked_yaml() -> list[str]:
    listed = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    return [name for name in listed if name.endswith((".yaml", ".yml"))]


def workflow_definitions(document: dict) -> dict[str, dict]:
    """큐 위에 놓이는 워크플로 선언을 이름과 함께 모은다."""
    found: dict[str, dict] = {}
    for key, declared in (document.get("workflows") or {}).items():
        if isinstance(declared, dict):
            found[f"workflows.{key}"] = declared
    for group in ("perKind", "singleKind"):
        for key, declared in ((document.get("jobWorkflows") or {}).get(group) or {}).items():
            if isinstance(declared, dict):
                found[f"jobWorkflows.{group}.{key}"] = declared
    return found


def check_queues(document: object) -> list[str]:
    """워크플로와 액티비티가 가리키는 큐가 선언되어 있고 폴링되는지 검사한다."""
    if not isinstance(document, dict):
        return [f"{QUEUES} 의 최상위가 대응표가 아니다"]

    queues = document.get("queues")
    if not isinstance(queues, dict) or not queues:
        return [f"{QUEUES} 가 queues 를 선언하지 않는다"]

    errors: list[str] = []
    hosts_workflows: dict[str, bool] = {}
    for key, declared in queues.items():
        if not isinstance(declared, dict) or not isinstance(declared.get("hostsWorkflows"), bool):
            errors.append(f"{QUEUES} 의 큐 {key} 가 hostsWorkflows 를 참이나 거짓으로 적지 않는다")
            continue
        hosts_workflows[key] = declared["hostsWorkflows"]

    for label, declared in workflow_definitions(document).items():
        queue = declared.get("queue")
        if queue not in hosts_workflows:
            errors.append(f"{label} 이 선언되지 않은 큐를 가리킨다 — {queue}")
        elif not hosts_workflows[queue]:
            # 워크플로를 등록하지 않는 워커가 폴링하는 큐에 두면 그 워크플로는 영원히 대기한다.
            errors.append(f"{label} 이 워크플로를 등록하지 않는 큐에 놓였다 — {queue}")

        for activity in declared.get("activities") or []:
            if not isinstance(activity, dict):
                continue
            queue = activity.get("queue")
            if queue not in hosts_workflows:
                errors.append(
                    f"{label} 의 액티비티 {activity.get('name')} 이 선언되지 않은 큐를 가리킨다 — {queue}"
                )

    return errors


def main() -> int:
    errors: list[str] = []
    files = tracked_yaml()

    for name in files:
        try:
            document = yaml.safe_load((ROOT / name).read_text(encoding="utf-8"))
        except yaml.YAMLError as cause:
            errors.append(f"{name} 이 YAML 로 읽히지 않는다: {cause}")
            continue
        if name == QUEUES:
            errors.extend(check_queues(document))

    if errors:
        print("계약의 YAML 이 규칙을 위반한다.\n", file=sys.stderr)
        for error in errors:
            print(f"  ✗ {error}", file=sys.stderr)
        return 1

    print(f"YAML {len(files)}개를 읽었다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
