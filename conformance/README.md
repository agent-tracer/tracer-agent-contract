# 적합성 스위트

구현체는 이 저장소를 자기 트리 안의 한 자리에 고정하고, 자기 테스트에서 `runner/`의 로더를
불러 케이스를 읽는다. 계약은 구현체의 소스를 읽지 않으며 구현체도 계약의 파일 배치를 알 필요가
없다. 로더가 아는 것은 자기 파일의 위치뿐이라 어느 자리에 고정하든 그대로 동작한다.

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

`divergence`는 통과·실패를 가리는 케이스가 아니라 목록이다. 구현체는 이것을 검사로 돌리지 않고,
자기가 그 항목의 어느 쪽인지 확인하는 데 쓴다. 항목이 사라지면 그 자리는 다른 케이스로 옮겨
검사가 된다.

## 계약의 판을 올리는 때

값 하나라도 바뀌면 판을 올린다. 케이스를 더하거나 `divergence`의 항목이 사라지면 부(minor)를,
경계 값이나 표면이 바뀌어 구현체가 따라오지 않으면 깨지는 변경이므로 주(major)를 올린다.
서술 문구만 다듬은 것은 수(patch)다.
