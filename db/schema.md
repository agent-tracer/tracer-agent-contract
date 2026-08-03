# 데이터베이스 스키마

## 채팅 도메인

- `chat_threads`: 사용자별 대화 묶음과 제목, 요약, backend 정보를 담는다.
- `chat_messages`: 대화에 속한 메시지 본문과 tool 호출 정보를 담는다.
- `chat_executions`: 사용자 요청 단위의 실행 상태, 응답 초안, 사용량, 비용, 종료 사유를 담는다. `replay_anchor_message_id` 는 이 실행이 모델에게 되돌려 줄 이력이 어느 메시지에서 끊기는지를 가리키며, 사용자 발화와 승인이 적재한 도구 결과가 모두 그 자리에 선다.
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
