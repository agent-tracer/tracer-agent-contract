# 데이터베이스 스키마

## 채팅 도메인

- `chat_threads`: 사용자별 대화 묶음과 제목, 요약, backend 정보를 담는다.
- `chat_messages`: 대화에 속한 메시지 본문과 tool 호출 정보를 담는다.
- `chat_executions`: 사용자 요청 단위의 실행 상태, 응답 초안, 사용량, 비용, 종료 사유를 담는다.
- `chat_execution_steps`: 실행별 모델 응답과 tool 호출 과정을 순서대로 담는다.
- `chat_pending_tools`: 대화에서 승인을 기다리거나 처리된 tool 호출을 담는다.
- `chat_user_memories`: 사용자별 기억을 key와 내용으로 담는다.

## 잡 도메인

- `ai_jobs`: 에이전트 실행 요청의 상태, 입력, 결과, 사용량, lease 정보를 담는 잡 원장이다.
- `ai_job_steps`: 잡 실행 중 발생한 모델 응답과 tool 호출 과정을 순서대로 담는다. 잡 원장은 실행 하나를 나타내는 `ai_jobs` 행에 여러 `ai_job_steps` 행이 달리는 구조다.
- `agent_run_observations`: 실행 시점의 모델, prompt, 비용, 검증, 호출 기록을 시도 단위로 담는다.

## 평가 도메인

- `evaluation_datasets`: 사용자별 평가 dataset의 이름, 설명, 현재 revision을 담는다.
- `evaluator_definitions`: evaluator의 종류, 버전, 설정, 구현 hash를 담는다.
- `experiments`: dataset revision과 evaluator set을 대상으로 수행하는 평가 실험의 상태와 예산을 담는다.
- `human_reviews`: 두 실험 실행을 사람이 비교한 선호, 보정 출력, 사유를 담는다.
- `prompt_fragment_definitions`: backend와 agent에 속한 prompt fragment의 식별 정보와 코드 이름을 담는다.

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
- `agent_run_observations.example_id` → `evaluation_examples.id`
- `agent_run_observations.variant_id` → `experiment_variants.id`
- `evaluation_datasets.user_id` → `users.user_id`
- `experiments.user_id` → `users.user_id`
- `experiments.evaluator_set_version` → `evaluator_sets.version`
- `human_reviews.user_id` → `users.user_id`
- `human_reviews.reviewer_user_id` → `users.user_id`
- `human_reviews.execution_a_id` → `experiment_executions.id`
- `human_reviews.execution_b_id` → `experiment_executions.id`
