# 적합성 스위트

구현체는 이 저장소를 자기 트리 안의 한 자리에 고정하고, 자기 테스트에서 `runner/`의 로더를
불러 케이스를 읽는다. 계약은 구현체의 소스를 읽지 않으며 구현체도 계약의 파일 배치를 알 필요가
없다. 로더가 아는 것은 자기 파일의 위치뿐이라 어느 자리에 고정하든 그대로 동작한다.

## 강제와 기록

TypeScript 구현이 정본이고 Python 구현이 그것을 따라간다. 그래서 계약의 자리는 두 종류다.

| | 무엇인가 | 어긋나면 |
|---|---|---|
| 강제 | 두 구현체가 같은 일을 할 수 있다는 말의 실질 | 실패 |
| 기록 | 정본이 지금 무엇을 하는지 적어 둔 것 | 차이 |

도구 목록이 가장 중요하다. 같은 도구를 갖는다는 것이 두 구현체가 같은 일을 할 수 있다는 말의
실질이며 이것만은 어긋나면 안 된다. 프롬프트 문구는 정본을 적어 둔 것이지 Python이 그대로 써야
하는 것이 아니다.

어느 자리가 어느 쪽인지는 `enforcement.json`이 소유한다. 구현체는 `enforcementLevel(자리)` ·
`enforcement_level(자리)`로 물어 자기 대조의 실패 여부를 가른다. 새 자리를 더하고 분류하지
않으면 `verify`가 먼저 걸린다.

`agent/shared/prompt.fragment.integrity.json`의 해시는 정본의 자기 검사다. 조각 텍스트가
의도치 않게 바뀌는 것을 막는 장치이지 두 구현체를 대조하는 것이 아니다.

## 붙이는 법

Node에서는 `conformance/runner/contract.mjs`를, Python에서는 `conformance/runner/contract.py`를
읽는다. 두 로더는 같은 것을 같은 이름으로 낸다.

| 하는 일 | Node | Python |
|---|---|---|
| 계약의 판을 읽는다 | `readVersion()` | `read_version()` |
| 케이스 이름을 낸다 | `listCases()` | `list_cases()` |
| 케이스 하나를 읽는다 | `readCase(name)` | `read_case(name)` |
| 에이전트 명세를 읽는다 | `readAgentSpec(agentId)` | `read_agent_spec(agent_id)` |
| 공유 계약을 읽는다 | `readShared(fileName)` | `read_shared(file_name)` |
| 계약 파일 하나를 읽는다 | `readJson(relative)` | `read_json(relative)` |
| 강제·기록 분류를 읽는다 | `readEnforcement()` | `read_enforcement()` |
| 자리 하나의 분류를 낸다 | `enforcementLevel(path)` | `enforcement_level(path)` |
| 추적 API 의존 경로를 낸다 | `readDependencyPaths()` | `read_dependency_paths()` |
| 도구가 부르는 경로를 낸다 | `readToolBindingPaths()` | `read_tool_binding_paths()` |

`verify`가 대화 도구의 `bindings`가 가리키는 경로를 `http/tracer-dependency.openapi.yaml`이
모두 적는지 대조한다. 도구가 부르는데 의존이 적지 않은 경로가 있으면 여기서 걸린다.

구현체는 자기가 고정한 판을 `readVersion()`의 값과 대조해, 계약이 앞서 나간 것을 자기 CI에서
먼저 본다. `node conformance/runner/verify.mjs`와 `python conformance/runner/verify.py`는
로더가 계약 파일과 케이스를 전부 읽어 낼 수 있는지만 확인하는 연기 검사다.

## 케이스가 대조하는 것

| 케이스 | 무엇을 대조하는가 |
|---|---|
| `envelope` | payload 하나를 응답 봉투로 성형한 결과와 봉투를 알아보는 판정 |
| `chat.intake` | 대화 턴 접수의 본문 제약, 멱등 해시가 먹는 바이트, 거절 사유의 상태와 코드 |
| `job.intake` | 잡 접수의 본문 제약, 잡 종류별 도메인 입력, 거절 사유의 상태와 코드 |
| `divergence` | 두 구현체가 아직 다른 자리 |

`divergence`는 통과·실패를 가리는 케이스가 아니라 **Python 구현이 아직 정본을 따라가지 못한
자리의 목록**이다. 양쪽 다 옳을 수 있는 차이가 아니라 좁혀야 할 대상이며, 항목마다 `canonical`이
어느 쪽이 정본인지 표시한다. 구현체는 이것을 검사로 돌리지 않고 자기가 그 항목의 어느 쪽인지
확인하는 데 쓴다. 항목이 사라지면 그 자리는 다른 케이스로 옮겨 검사가 된다.

## 계약의 판을 올리는 때

값 하나라도 바뀌면 판을 올린다. 케이스를 더하거나 `divergence`의 항목이 사라지면 부(minor)를,
경계 값이나 표면이 바뀌어 구현체가 따라오지 않으면 깨지는 변경이므로 주(major)를 올린다.
서술 문구만 다듬은 것은 수(patch)다.
