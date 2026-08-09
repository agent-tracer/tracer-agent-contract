# 데이터베이스 스키마

## 마이그레이션 적용

`db/migrations/` 의 SQL 은 Flyway 가 적용한다. 적용기는 언어 중립 도구 하나이며 어느 구현체도
DDL 을 실행하지 않는다. 파일 이름은 Flyway 관습인 `V<번호>__<이름>.sql` 이고 네 자리 번호가
곧 판이다. 번호는 `0001` 부터 빠짐없이 하나씩 오르며 `scripts/check-contract-files.mjs` 가
그 규칙을 검사한다.

적용 이력은 Flyway 가 대상 원장에 만드는 `flyway_schema_history` 가 갖는다. 계약은 이력 표를
선언하지 않으며 이미 적용된 판을 건너뛰는 판단도 그 표가 한다. 이 판의 적용기는 빈 원장을
전제하므로, 이력 표 없이 DDL 이 적용되어 있던 원장은 이어받지 않고 비운 뒤 다시 적용한다.

이 디렉터리의 DDL 은 에이전트 실행 원장 `agent-db` 하나만 대상으로 한다. 추적 원장의 DDL 은
`agent-tracer` 가 소유하며 이 계약의 범위 밖이다. 배포에서 어느 원장의 DDL 이 서는지는
프로파일이 세우는 원장이 정한다.

| 배포 프로파일 | 추적 원장 `event-db`·`tracer-db` | 에이전트 원장 `agent-db` |
| --- | --- | --- |
| `tracer` | `agent-tracer` 의 `migrate` 원샷 | 원장을 세우지 않는다 |
| `ts` | 같다 | 이 디렉터리를 Flyway 가 적용한다 |
| `python` | 같다 | 이 디렉터리를 Flyway 가 적용한다 |
| `compare` | 같다 | 이 디렉터리를 Flyway 가 한 번 적용한다 |

```bash
docker run --rm -v "$PWD/db/migrations:/flyway/sql:ro" \
  -e FLYWAY_URL=jdbc:postgresql://127.0.0.1:5434/agent \
  -e FLYWAY_USER=root -e FLYWAY_PASSWORD=root \
  flyway/flyway:11-alpine migrate
```

## 채팅 도메인

- `chat_threads`: 사용자별 대화 묶음과 제목, 요약, backend 정보를 담는다. `summary_through_message_id` 는 그 요약이 접은 마지막 메시지를 가리키며, 읽는 쪽이 그 뒤부터 실어 요약과 재생 사이에 빈 구간이 생기지 않게 한다. 요약과 이 칸은 CHECK 제약으로 함께 있거나 함께 없다.
- `chat_messages`: 대화에 속한 메시지 본문과 tool 호출 정보를 담는다.
- `chat_executions`: 사용자 요청 단위의 실행 상태, 응답 초안, 사용량, 비용, 종료 사유를 담는다. `replay_anchor_message_id` 는 이 실행이 모델에게 되돌려 줄 이력이 어느 메시지에서 끊기는지를 가리키며, 사용자 발화와 승인이 적재한 도구 결과가 모두 그 자리에 선다. `phase` 는 초안이 자라지 않는 구간에도 실행이 무엇을 하는 중인지를 담으며 값의 목록은 `conformance/cases/chat.query.json` 의 `executionPhase` 가 갖는다.
- `chat_execution_steps`: 실행별 모델 응답과 tool 호출 과정을 순서대로 담는다.
- `chat_pending_tools`: 대화에서 승인을 기다리거나 처리된 tool 호출을 담는다.
- `chat_user_memories`: 사용자별 기억을 key와 내용으로 담는다.

## 잡 도메인

- `ai_jobs`: 에이전트 실행 요청의 축, 상태, 입력, 결과, 사용량, lease 정보를 담는 잡 원장이다.
- `ai_job_steps`: 잡 실행 중 발생한 모델 응답과 tool 호출 과정을 순서대로 담는다. 잡 원장은 실행 하나를 나타내는 `ai_jobs` 행에 여러 `ai_job_steps` 행이 달리는 구조다.
- `agent_run_observations`: 실행 시점의 모델, prompt, 비용, 검증, 호출 기록을 시도 단위로 담는다.
- `ai_job_stage_outputs`: 잡 하나가 단계마다 낸 산출을 담아 다시 시도한 실행이 앞선 단계를 다시 태우지 않게 한다. `slot` 은 같은 단계가 팬아웃과 재파견으로 여러 번 도는 자리를 가르며, 잡이 종결하면 그 잡의 행을 지운다.

## 실행의 축

`backend` 컬럼은 그 실행을 태운 구현체 하나를 가리키며 값은 `ts` 와 `python` 둘뿐이다. HTTP 표면의 `AgentAxis` 가 이 어휘의 정본이고 지표 라벨 `agent_tracer.backend` 도 같은 값을 싣는다. 잡 하나를 워크플로가 태웠는지 로컬 실행기가 태웠는지는 `ai_jobs.executor` 가 따로 갖는 다른 구분이다.

- `ai_jobs.backend`: 접수구가 요청을 받는 순간 정해지며 값이 없는 행을 두지 않는다. 대기하거나 실행 중인 잡은 관측 기록이 아직 없으므로 축으로 세려면 이 칸이 있어야 한다.
- `agent_run_observations.backend`: 그 시도를 실제로 태운 축이며 실행이 끝난 뒤에 행과 함께 남는다.
- `chat_threads.backend`: 그 스레드의 턴을 맡은 축이며 아직 정해지지 않았으면 비어 있다.

## 설정 도메인

- `app_settings`: 에이전트 실행에 쓰는 설정값을 scope 와 key 한 쌍으로 담는다.

## 외부 표 참조

아래 컬럼은 대상 표가 이 스키마의 범위에 없으므로 외래 키 제약을 두지 않는다.

- `chat_threads.user_id` → `users.user_id`
- `chat_executions.user_id` → `users.user_id`
- `chat_execution_steps.user_id` → `users.user_id`
- `chat_user_memories.user_id` → `users.user_id`
- `ai_jobs.user_id` → `users.user_id`
- `ai_jobs.task_id` → `tasks.id`
- `ai_job_steps.user_id` → `users.user_id`
- `agent_run_observations.user_id` → `users.user_id`
