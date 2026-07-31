# tracer-agent-contract

에이전트 서비스의 구현체가 공유하는 언어 중립 계약입니다. HTTP 표면, wire 봉투와 헤더·토픽, 실행 원장 스키마, Temporal 큐, 에이전트별 도구·출력·프롬프트 규격, 그리고 이것들을 지키는지 검사하는 적합성 스위트를 소유합니다.

계약이 별도의 저장소인 이유는 언어입니다. 두 언어가 같은 파일 집합을 읽어야 하는데 어느 구현체 저장소에 두면 다른 쪽이 남의 저장소를 통째로 받게 됩니다. 두 구현체가 이 저장소의 판을 submodule로 고정하고 각자의 CI에서 적합성 스위트를 실행합니다. 애플리케이션을 빌드하지도 실행하지도 않으며 배포 산출물도 없습니다. 스펙 파일과 검사기뿐입니다. TypeScript 구현이 정본이고 Python 구현이 그것을 따라갑니다.

## 계약 범위

| 영역 | 정본 |
| --- | --- |
| HTTP 표면 | `http/agent-api.openapi.yaml`, `http/tracer-dependency.openapi.yaml` |
| wire와 이벤트 | `wire/envelope.json`, `headers.json`, `topics.json`, `job.kinds.json` |
| 실행 원장 | `db/migrations/*.sql`, `db/schema.md` |
| 워크플로 | `workflow/queues.yaml` |
| 에이전트 규격 | `agent/{chat,recipe-scan,rule-generation,task-cleanup,title-suggestion}/` |
| 공유 프롬프트·오류·어휘 | `agent/shared/*.json` |
| 추적 API 질의 조건 | `tracer/query-conditions.md` |
| 적합성 케이스 | `conformance/cases/*.json` |
| 강제 수준 | `conformance/enforcement.json` |
| 계약 판 | `VERSION` |

표면은 `enforced`와 `recorded`로 나뉩니다. `enforced`는 두 구현체가 동일하게 제공해야 하는 항목이고, `recorded`는 정본 구현의 현재 동작 또는 구현체 사이의 차이를 기록하는 항목입니다. 분류되지 않은 파일이 들어오면 검사기가 실패로 처리합니다.

## 적합성 검사

Node와 Python 검사기는 계약 파일·케이스·강제 수준·도구 결속과 HTTP 표면의 연결을 검사합니다. 구현체의 실제 동작 테스트는 각 구현체 저장소의 CI가 따로 수행하며 이 검사기가 그것을 대신하지 않습니다.

```bash
node conformance/runner/verify.mjs
python conformance/runner/verify.py
```

실행 중인 구현체가 계약 표면을 실제로 제공하는지까지 확인하려면 주소를 전달합니다.

```bash
node conformance/runner/verify.mjs http://127.0.0.1:3904
python conformance/runner/verify.py http://127.0.0.1:8800
```

검사기는 다음을 확인합니다.

- 모든 적합성 케이스와 `agent`·`shared`·`wire` 파일을 읽을 수 있는가
- 모든 표면이 `enforced` 또는 `recorded`로 분류되었는가
- 에이전트 도구가 부르는 경로를 두 OpenAPI 표면이 덮는가
- 잡 종류·토픽·프롬프트 조각 등록부의 목록과 승격 경로가 서로 맞는가
- 전달한 주소의 `/internal/surface`가 계약 경로를 실제로 제공하는가

`conformance/cases/divergence.json`은 실패 케이스가 아니라 현재의 구현 차이를 기록하는 파일입니다. 차이를 더하거나 해소할 때는 정본 구현의 방향과 영향 범위를 함께 갱신합니다. 기록되었다는 사실이 그 차이를 허용한다는 뜻은 아닙니다.

## 구현체에 연결하는 방법

두 구현체는 이 저장소를 `contract/` submodule로 고정하고 각자의 CI에서 고정된 판을 읽습니다.

```bash
git clone --recurse-submodules <구현체 저장소>
# 이미 clone 한 경우
git submodule update --init --recursive
```

계약을 바꿀 때는 `VERSION`을 먼저 갱신하고 두 구현체의 submodule 포인터와 테스트를 함께 갱신합니다.

- patch — 설명만 바뀝니다
- minor — 케이스를 더하거나 비호환 없이 범위를 넓힙니다
- major — 경계·필드·HTTP 표면이 바뀌어 구현체의 변경이 필요합니다

## 저장소 구조

```text
tracer-agent-contract/
├── agent/
│   ├── chat/ recipe-scan/ rule-generation/ task-cleanup/ title-suggestion/
│   └── shared/                  공통 오류·어휘·프롬프트·평가 계약
├── conformance/
│   ├── cases/                   봉투·대화·잡·차이 케이스
│   ├── runner/                  Node·Python 적재기와 검사기
│   └── enforcement.json         enforced · recorded 분류
├── db/
│   ├── migrations/              에이전트 실행 원장 SQL
│   └── schema.md
├── http/                        OpenAPI 3.1 표면
├── tracer/                      추적 API 질의 조건
├── wire/                        봉투·헤더·토픽·잡 종류
├── workflow/                    큐 선언
└── VERSION                      계약 판
```

## 변경 컨벤션

- 구현체에 복제된 타입 목록을 계약의 대체 정본으로 삼지 않습니다. 케이스와 JSON·YAML·OpenAPI 파일을 먼저 갱신합니다.
- HTTP 경로 변수명은 비교 시 정규화되지만 메서드·경로·응답 봉투·도구 결속은 계약의 일부입니다.
- 도구 목록은 두 구현체가 같은 능력을 제공한다는 강제 기준입니다. 프롬프트 문구처럼 정본 구현을 기록하는 항목과 구분합니다.
- 새 케이스와 공유 파일은 반드시 `enforcement.json`에 분류합니다.
- 계약을 고치면 두 검사기와 두 구현체의 전체 테스트·빌드를 함께 실행합니다.

## 관련 저장소

- [tracer-agent-ts](https://github.com/agent-tracer/tracer-agent-ts) — 정본 TypeScript 구현
- [tracer-agent-python](https://github.com/agent-tracer/tracer-agent-python) — Python 구현
- [tracer-agent-web](https://github.com/agent-tracer/tracer-agent-web) — 에이전트 화면 리모트
- [agent-tracer](https://github.com/agent-tracer/agent-tracer) — 추적 수집·조회 플랫폼
- [agent-tracer-stack](https://github.com/agent-tracer/agent-tracer-stack) — 구현체 선택과 배포 합성

## 라이선스

MIT License
