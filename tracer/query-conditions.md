# 조회 조건 기록

이 문서는 강제되는 제약이 아니라 조회 동작을 설명하는 기록이다. TypeScript 구현이 정본이며 정본의 조회 조건이 바뀌면 이 문서가 따라 바뀐다. Python 구현은 자기 질의를 적을 때 이것을 본다.

1장부터 10장까지는 에이전트의 도구가 추적 API에 요구하는 조회이고, 11장부터는 에이전트가 자기 원장에 여는 조회다. 두 표면의 소유는 `http/tracer-dependency.openapi.yaml`과 `http/agent-api.openapi.yaml`이 가른다.

## 공통 표기

- `userId`, `taskId` 같은 인자는 호출 시 전달되는 값이다.
- 정렬이나 상한이 코드에 지정되지 않은 경우에는 각각 "지정 없음"으로 적는다.
- 질의가 여러 번 나뉘어 실행되는 조회는 단일 `JOIN`처럼 적지 않고 실제 실행 단위로 나눈다.

## 1. `GET /api/v1/tasks`

- 주 조회: `tasks t LEFT JOIN task_user_state s ON s.task_id = t.id AND s.user_id = :userId`.
- `tasks`에서 읽는 값: `id`, `user_id`, `title`, `title_rank`, `slug`, `workspace_path`, `status`, `task_kind`, `origin`, `cli_source`, `parent_task_id`, `parent_session_id`, `background_of_task_id`, `created_at`, `updated_at`, `last_session_started_at`, `last_event_at`, `last_applied_seq`를 포함한 task 행 전체.
- `task_user_state`에서 읽는 사용자별 상태: `archived_at`, `hidden_at`, `updated_at`. 조인 키인 `task_id`, `user_id`도 이 테이블의 컬럼이다. 목록 DTO에서 사용자별 표시 상태를 만드는 값은 `archived_at`, `hidden_at`이며 task의 `status`, `origin`, `parent_task_id` 등은 `tasks`에서 온다.
- 필수 조건: `t.user_id = :userId` 및 `s.hidden_at IS NULL`. `LEFT JOIN` 결과에서 상태 행이 없어도 `s.hidden_at IS NULL`을 만족하므로 노출된다.
- 선택 조건: `status`가 있으면 `t.status = :status`, `origin`이 있으면 `t.origin = :origin`, `root = true`이면 `t.parent_task_id IS NULL`, `parentTaskId`가 있으면 `t.parent_task_id = :parentTaskId`.
- `archived`가 지정되면 `true`는 `s.archived_at IS NOT NULL`, `false`는 `s.archived_at IS NULL`. 생략하면 보관 여부로 거르지 않는다.
- cursor 조건: `(t.updated_at < :cursorAt OR (t.updated_at = :cursorAt AND t.id < :cursorId))`.
- 정렬: `t.updated_at DESC, t.id DESC`.
- 상한: 기본 30, 최대 100. 0 이하이거나 유한수가 아니면 30, 그 밖에는 정수로 내린 뒤 100 이하로 제한한다.
- 전체 개수는 같은 filter와 같은 `LEFT JOIN`, `s.hidden_at IS NULL`, 보관 조건을 적용하되 cursor와 상한을 제외해 별도 `COUNT`한다.

## 2. `GET /api/v1/tasks/{taskId}`

- task 조회: `tasks`에서 `user_id = :userId AND id = :taskId`. 정렬·상한 지정 없음.
- 사용자 상태 조회: `task_user_state`에서 `user_id = :userId AND task_id = :taskId`. 정렬·상한 지정 없음.
- session 조회: `sessions`에서 `user_id = :userId AND task_id = :taskId`, `started_at DESC`. 상한 지정 없음.
- `JOIN`은 사용하지 않고 task가 없으면 사용자 상태와 session을 조회하지 않는다. task가 있으면 뒤의 두 조회를 병렬 실행한다.
- 응답의 task 표시 상태는 `task_user_state.archived_at`, `task_user_state.hidden_at`을 사용한다. task 필드는 `tasks`에서 읽는다.
- `resumeTarget`은 `started_at DESC` 결과에서 `runtime_session_id`를 trim했을 때 비어 있지 않은 첫 session을 고른다.

## 3. `GET /api/v1/tasks/{taskId}/timeline`

- 소유권 확인: `tasks`에서 `user_id = :userId AND id = :taskId`. task가 없으면 event를 조회하지 않는다.
- event 조회: `events e`에서 `e.user_id = :userId AND e.task_id = :taskId`.
- cursor가 있으면 `e.seq < :cursor`를 추가한다.
- DB 정렬: `e.seq DESC`. 응답은 조회된 page를 뒤집어 `seq ASC` 방향으로 낸다.
- 상한: 기본 100, 최대 500. 0 이하이거나 유한수가 아니면 100, 그 밖에는 정수로 내린 뒤 500 이하로 제한한다.
- page 크기가 상한과 같으면 DB 결과의 마지막 항목, 즉 page에서 가장 작은 `seq`를 다음 cursor로 사용한다.

## 4. `GET /api/v1/events/search`

이 조회는 관계형 테이블이 아니라 OpenSearch의 두 인덱스를 병렬 검색한다.

- `events` 인덱스 filter: 항상 `term userId = :userId`; 값이 있으면 `term taskId`, `term kind`, `term lane`을 추가한다. `from` 또는 `to`가 있으면 `occurredAt` range에 각각 `gte`, `lte`를 적용한다.
- `events` 인덱스 본문 조건: `q`가 truthy이면 `title`, `body` 대상 `multi_match`; 아니면 `match_all`.
- `events` 정렬·상한: `occurredAt DESC`, `size = limit`.
- `memos` 인덱스 filter: 항상 `term userId = :userId`, `exists eventId`; `taskId`가 있으면 `term taskId`를 추가한다.
- `memos` 인덱스 본문 조건: `q`가 truthy이면 `body` 대상 `multi_match`; 아니면 `match_all`.
- `memos` 정렬·상한: `updatedAt DESC`, `size = limit`.
- 공통 `limit`: 기본 20, 최대 100. 0 이하이거나 유한수가 아니면 20, 그 밖에는 정수로 내린 뒤 100 이하로 제한한다.
- 결과는 event hit 전부 뒤에 memo hit 전부를 붙인다. 두 묶음을 합친 뒤의 재정렬이나 공통 상한은 없으므로 최대 `2 * limit`개다.
- soft-delete 조건은 두 검색 요청에 지정되지 않는다.

## 5. `GET /api/v1/memos`

- `taskId`가 없으면 `memos`에서 `user_id = :userId AND deleted_at IS NULL`. `eventId`만 전달해도 이 분기로 들어가며 `eventId`는 filter에 쓰이지 않는다. 정렬·상한 지정 없음.
- `taskId`가 있고 `eventId`가 없으면 `memos`에서 `user_id = :userId AND task_id = :taskId AND deleted_at IS NULL`, `created_at ASC`로 읽은 뒤 application 계층에서 `event_id IS NULL`인 행만 남긴다. 상한 지정 없음.
- `taskId`와 `eventId`가 모두 있으면 `memos`에서 `event_id = :eventId AND deleted_at IS NULL`, `created_at ASC`로 읽은 뒤 application 계층에서 `user_id = :userId AND task_id = :taskId`인 행만 남긴다. 상한 지정 없음.
- `JOIN`은 사용하지 않는다.

## 6. `GET /api/v1/rules`

- `all = true`: `rules`에서 `user_id = :userId AND deleted_at IS NULL`.
- 그 밖의 경우: `rules`에서 `user_id = :userId AND task_id = :taskId AND deleted_at IS NULL`. `taskId`가 없으면 `task_id = ''`를 사용한다.
- 목록에 붙일 판정 조회: 선택된 rule id가 있으면 `verdicts`에서 `rule_id IN (:...ruleIds)`. id가 없으면 쿼리를 실행하지 않고 빈 결과를 쓴다.
- `JOIN`은 사용하지 않는다. verdict는 `rule_id`별 map으로 만든 뒤 rule 순서를 유지해 결합한다.
- 정렬·상한: 모든 조회에 지정 없음.
- 이 목록 조회는 `review_state`로 거르지 않아 승인 대기 상태도 포함한다.
- 실행에 적용할 active 규칙 조회의 정확한 조건은 `rules.user_id = :userId AND rules.task_id = :taskId AND rules.deleted_at IS NULL AND rules.review_state = 'active'`이다. 이 조건은 목록 조회가 아니라 실행에 적용할 규칙을 고를 때 쓰인다.

## 7. `GET /api/v1/rules/{ruleId}/evidence`

- rule 조회: `rules`에서 `id = :ruleId`. 조회 후 `rule.user_id = :userId`를 application 계층에서 검사한다. 이 조회 자체에는 `deleted_at IS NULL` 조건이 없다.
- verdict 조회: `verdicts`에서 `rule_id = :ruleId`.
- event id 목록은 verdict의 `evidence.enforcements`에서 중복을 제거해 만든다. 목록이 비면 event 쿼리를 실행하지 않는다. 값이 있으면 `events`에서 `id IN (:...eventIds)`로 조회한다.
- event 조회에는 `user_id`, `task_id`, soft-delete 조건이 없다. 반환 시 enforcement 순서를 돌면서 찾은 event만 `trigger`와 `expect` 묶음에 각각 추가한다.
- query의 `taskId`는 DB filter에 쓰이지 않고 응답의 `taskId`에만 쓰인다. 생략하면 `rule.task_id`를 쓴다.
- `JOIN`, 정렬, 상한: 지정 없음.

## 8. `GET /api/v1/tags`

- tag 조회: `tags`에서 `user_id = :userId AND deleted_at IS NULL`, `name ASC`. 상한 지정 없음.
- 부착 개수 조회: `task_tags`에서 `user_id = :userId`. 정렬·상한 지정 없음. 읽은 행을 application 메모리에서 `tag_id`별로 센다.
- 두 조회는 병렬 실행하며 `JOIN`은 사용하지 않는다. tag마다 집계한 개수를 붙이고, 대응 행이 없으면 0을 쓴다.

## 9. `GET /api/v1/recipes`

- recipe 조회: `recipes`에서 `user_id = :userId AND status = :status AND deleted_at IS NULL`, `updated_at DESC`. 상한 지정 없음.
- `status`가 있으면 위 조회를 한 번 실행한다. 없으면 정의된 모든 recipe status별로 병렬 조회하고 status 정의 순서대로 결과 배열을 이어 붙인다. 전체 결과에 대한 재정렬은 없다.
- 각 recipe의 통계 조회: `recipe_applications`에서 `recipe_id = :recipeId`, `created_at DESC`. 상한 지정 없음. recipe마다 한 번씩 실행한다.
- 인용 task 제목 조회: recipe에서 모은 중복 없는 task id가 있으면 `tasks`에서 `user_id = :userId AND id IN (:...taskIds)`. 정렬·상한 지정 없음. id가 없으면 실행하지 않는다.
- `JOIN`은 사용하지 않는다.

## 10. `GET /api/v1/task-cleanup/suggestions`

- 조회: `task_cleanup_suggestions`에서 `user_id = :userId AND status = :status`, `created_at DESC`. 상한 지정 없음.
- `status`가 있으면 한 번 실행한다. 없으면 정의된 모든 cleanup suggestion status별로 병렬 조회하고 status 정의 순서대로 배열을 이어 붙인다. 전체 결과에 대한 재정렬은 없다.
- 결합한 결과에서 `status = 'pending'`인 행만 `task_id + ':' + kind` 키로 중복을 제거해 첫 행을 남긴다. 다른 status의 행은 중복 제거 대상이 아니다.
- `JOIN`과 soft-delete 조건은 없다.

## 11. `GET /api/agent/jobs/{jobId}`

- 조회: `ai_jobs`에서 `id = :jobId`. 행이 있으면 application 계층에서 `user_id = :userId`를 검사해 결과를 낸다.
- `JOIN`, 정렬, 상한, soft-delete 조건: 지정 없음.

## 12. `GET /api/agent/chat/memories`

- 조회: `chat_user_memories`에서 `user_id = :userId`.
- 정렬: `updated_at DESC`.
- `JOIN`, 상한, soft-delete 조건: 지정 없음.

## 13. `GET /api/agent/jobs`

- 조회: `ai_jobs`에서 `kind = :kind AND status = 'pending'`, `created_at ASC`. 상한 지정 없음.
- 소유자 검사는 질의에 없고 읽은 행 중 `user_id = :userId`인 것만 application 계층에서 남긴다.
- `kind`는 필수이며 원장의 잡 종류 넷 중 하나여야 한다. `status`를 실으면 `pending`이어야 한다.
- `JOIN`, soft-delete 조건: 없음.

## 14. `GET /api/agent/jobs/history`

- 조회: `ai_jobs`에서 `user_id = :userId`. `kind`가 있으면 `kind = :kind`, `status`가 있으면 `status = :status`를 추가한다.
- 정렬: `created_at DESC`.
- 상한: 기본 50, 최소 1, 최대 100. 건너뛰기는 기본 0이고 음수를 받지 않는다. 두 값이 범위를 벗어나면 조회하지 않고 거절한다.
- 전체 개수는 같은 조건에서 상한과 건너뛰기만 뺀 `COUNT`이며 같은 질의 한 번으로 함께 센다.
- `JOIN`, soft-delete 조건: 없음.

## 15. `GET /api/agent/jobs/latest`

- 조회: `ai_jobs`에서 `user_id = :userId AND kind = :kind`. `taskId`가 있으면 `task_id = :taskId`를 추가한다.
- 정렬: `created_at DESC`. 상한은 한 행이다.
- 조건에 맞는 행이 없으면 `job`이 비어 있는 성공 응답이며 404가 아니다.
- `kind`는 필수이며 원장의 잡 종류 넷 중 하나여야 한다.
- `JOIN`, soft-delete 조건: 없음.

## 16. `GET /api/agent/jobs/{id}/steps`

- 소유권 확인: `ai_jobs`에서 `id = :id`를 읽고 `user_id = :userId`를 application 계층에서 검사한다. 어긋나면 궤적을 조회하지 않고 404다.
- 궤적 조회: `ai_job_steps`에서 `job_id = :id AND user_id = :userId`, `attempt ASC, seq ASC`. 상한 지정 없음.
- `JOIN`, soft-delete 조건: 없음.

## 17. `GET /api/agent/chat/threads`

- 조회: `chat_threads`에서 `user_id = :userId`, `updated_at DESC`. 상한 지정 없음.
- `JOIN`, soft-delete 조건: 없음.

## 18. `GET /api/agent/chat/threads/{threadId}`

- 조회: `chat_threads`에서 `id = :threadId`를 읽고 `user_id = :userId`를 application 계층에서 검사한다. 어긋나면 404다.
- `JOIN`, 정렬, 상한: 지정 없음.

## 19. `GET /api/agent/chat/threads/{threadId}/messages`

- 소유권 확인: 18장과 같다. 어긋나면 메시지를 조회하지 않는다.
- 메시지 조회: `chat_messages`에서 `thread_id = :threadId`, `created_at ASC, id ASC`. 상한 지정 없음.
- 같은 시각에 여러 줄이 쌓이므로 `id`가 둘째 정렬 키로 순서를 고정한다.
- `JOIN`, soft-delete 조건: 없음.

## 20. `GET /api/agent/chat/threads/{threadId}/executions`

- 소유권 확인: 18장과 같다.
- 실행 조회: `chat_executions`에서 `thread_id = :threadId`, `created_at DESC`. 상한 지정 없음.
- 대기 도구 조회: `chat_pending_tools`에서 `thread_id = :threadId`, `created_at ASC`. 상한 지정 없음. 읽은 행 중 `status = 'pending'`인 것만 application 계층에서 남긴다.
- 두 조회는 병렬 실행하며 `JOIN`은 사용하지 않는다.

## 21. `GET /api/agent/chat/threads/{threadId}/executions/{executionId}/steps`

- 소유권 확인: `chat_executions`에서 `id = :executionId`를 읽고 `user_id = :userId`와 `thread_id = :threadId`를 application 계층에서 검사한다. 어긋나면 궤적을 조회하지 않고 404다.
- 궤적 조회: `chat_execution_steps`에서 `execution_id = :executionId AND user_id = :userId`, `attempt ASC, seq ASC`. 상한 지정 없음.
- `JOIN`, soft-delete 조건: 없음.

## 22. `GET /api/agent/chat/threads/{threadId}/executions/{executionId}/events`

- 스냅샷 하나는 세 조회를 병렬 실행해 만든다. `chat_threads`에서 `id = :threadId`, `chat_executions`에서 `id = :executionId`, `chat_pending_tools`에서 `thread_id = :threadId`를 `created_at ASC`로 읽는다.
- 소유권 검사는 application 계층에서 하며 스레드의 `user_id`, 실행의 `user_id`, 실행의 `thread_id` 셋이 모두 맞아야 한다. 하나라도 어긋나면 404이고 연결을 열지 않는다.
- 대기 도구는 `status = 'pending'`인 행만 남긴다.
- 같은 세 조회를 깨우기 신호마다 그리고 20초마다 다시 실행한다. 프레임의 `id`는 실행의 `draft_seq`와 `updated_at`을 콜론으로 이은 값이다.
- 실행이 `completed`이거나 `failed`이거나 `canceled`인 스냅샷을 보낸 뒤 연결을 닫는다.
- `JOIN`, 상한, soft-delete 조건: 없음.

## 23. `GET /api/agent/chat/threads/{threadId}/executions/{executionId}/replay`

조회 조건과 재생 계산을 함께 적는다. **두 구현체가 같은 대화를 같은 이력으로 재생하는 것이 이 장의 목적이다.**

### 조회

- 소유권 확인: `chat_executions`에서 `id = :executionId`를 읽고 `user_id = :userId`와 `thread_id = :threadId`를 검사한다. 어긋나면 404다.
- 셋을 병렬 실행한다. `chat_threads`에서 `id = :threadId`, `chat_messages`에서 `thread_id = :threadId`를 `created_at ASC, id ASC`로, `chat_user_memories`에서 `user_id = :userId`를 `updated_at DESC`로 읽는다.
- 스레드를 읽은 뒤 `user_id = :userId`를 한 번 더 검사한다. 어긋나면 404다.
- 메시지는 실행 식별자로 거르지 않는다. 도구 승인이 적재한 결과 줄은 어느 실행에도 매이지 않으므로 실행별로 모으면 통째로 빠진다.
- 응답의 `summary`는 스레드의 `summary`를 그대로 싣고, `facts`는 기억 행에서 `key`와 `content`만 남긴다.

### 자르기

- 이번 턴의 사용자 메시지, 즉 실행 행의 `user_message_id`가 가리키는 줄까지가 이력이다. 그 뒤의 줄은 이 턴이 만들 것이라 아직 이력이 아니다.
- 그 식별자가 읽은 메시지에 없으면 재생을 만들지 않고 실패한다.
- 스레드의 `summary`가 비어 있거나 공백뿐이면 자른 이력을 그대로 재생한다.
- 요약이 있으면 최근 대화 턴 여덟 개까지만 남긴다. 창의 단위는 대화 턴이며 `role = 'tool'`인 줄은 턴으로 세지 않고 자기 턴에 딸려 함께 남는다. 뒤에서부터 세어 아홉째 턴을 만나는 순간 그 줄의 다음부터를 창으로 삼는다.

### 접기

- 도구 호출의 짝은 창 안에서만 본다. `role = 'assistant'`인 줄이 선언한 호출 식별자 전부가 답을 받았을 때만 그 줄의 호출이 짝을 이룬 것으로 센다.
- 답은 호출 바로 뒤에 이어져야 한다. `role = 'tool'`이 아닌 줄이 끼어드는 순간 그 뒤의 결과는 그 호출의 답이 아니다.
- 어시스턴트 줄은 짝을 이룬 호출만 남긴다. 남은 호출이 없고 본문도 비어 있으면 그 줄을 재생하지 않는다. 남은 호출이 없고 본문이 있으면 본문만 재생한다.
- 도구 줄은 짝을 이루었으면 `toolCallId`를 그대로 싣고, 짝을 잃었으면 그 인용만 지워 평문 문맥으로 남긴다. 버리지 않는다.
- 확인 게이트 때문에 답이 없는 호출이 정상적으로 쌓이고 거절당한 호출은 영영 짝이 없으므로, 이 접기가 없으면 모델이 답 없는 호출을 받는다.
