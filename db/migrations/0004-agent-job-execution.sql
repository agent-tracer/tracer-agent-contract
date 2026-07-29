-- 자기 접수구에서 원장을 직접 쓰는 구현체의 실행 상태이며 잡 조회가 ai_jobs 와 함께 읽는다.
CREATE TABLE IF NOT EXISTS "graph_job_executions" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "kind" text NOT NULL,
    "idempotency_key" text,
    "status" text NOT NULL,
    "budget_usd" double precision NOT NULL,
    "cost_usd" double precision,
    "error" text,
    "task_id" text,
    "result" jsonb,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "graph_job_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "graph_job_executions_idempotency"
    ON "graph_job_executions" ("kind", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "graph_job_executions_kind_status"
    ON "graph_job_executions" ("kind", "status");

CREATE INDEX IF NOT EXISTS "graph_job_executions_user_kind_task"
    ON "graph_job_executions" ("user_id", "kind", "task_id");
