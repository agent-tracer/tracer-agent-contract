-- 대화 실행의 축은 접수구가 받는 순간 정해지고 그 뒤 조회가 자기 축의 행만 가져간다. 축을
-- 갖지 않는 대기 행은 어느 축도 가져가지 않아 사용자에게 무한 대기로 보이므로 여기서 접는다.
UPDATE "chat_executions"
   SET "status" = 'failed',
       "error" = COALESCE("error", 'Chat execution has no requested backend'),
       "completed_at" = COALESCE("completed_at", now()),
       "updated_at" = now()
 WHERE "requested_backend" IS NULL
   AND "status" IN ('queued', 'running');

-- 이미 접힌 행의 빈 축은 그대로 둔다. 조회가 대기와 실행 중인 행만 보므로 그 행에 닿지 않는다.
ALTER TABLE "chat_executions"
  DROP CONSTRAINT IF EXISTS "chat_executions_requested_backend_check";
ALTER TABLE "chat_executions"
  ADD CONSTRAINT "chat_executions_requested_backend_check"
  CHECK ("requested_backend" IS NULL OR "requested_backend" IN ('ts', 'python'));

CREATE INDEX IF NOT EXISTS "chat_executions_active_backend"
    ON "chat_executions" ("requested_backend", "thread_id", "created_at")
    WHERE "status" IN ('queued', 'running');
