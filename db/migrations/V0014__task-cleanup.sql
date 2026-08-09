-- 정리 제안을 만드는 주체가 에이전트이므로 제안 원장도 에이전트 원장에 선다.
-- observed_last_event_at 은 제안이 관측한 그 태스크의 마지막 사건 시각이며 수락이 추적에
-- 조건으로 실어 보내는 값이다.
CREATE TABLE IF NOT EXISTS "task_cleanup_suggestions" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "job_id" text NOT NULL,
    "task_id" text NOT NULL,
    "kind" text NOT NULL,
    "current_value" text,
    "proposed_value" text,
    "rationale" text NOT NULL,
    "status" text NOT NULL,
    "error" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "resolved_at" TIMESTAMP WITH TIME ZONE,
    "observed_last_event_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "task_cleanup_suggestions_pkey" PRIMARY KEY ("id")
);

-- 같은 태스크와 종류에 대기 중인 제안은 하나뿐이므로 다시 스캔해도 대기 행의 수가 늘지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS "cleanup_pending_task_kind_unique"
    ON "task_cleanup_suggestions" ("user_id", "task_id", "kind") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "cleanup_user_status"
    ON "task_cleanup_suggestions" ("user_id", "status", "created_at");
