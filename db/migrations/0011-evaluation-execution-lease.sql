ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "lease_owner" text;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "job_id" text;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "trace_id" text;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "resolved_prompt_hash" text;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
ALTER TABLE "experiment_executions" ADD COLUMN IF NOT EXISTS "failure_reason" text;

-- 다음 실행을 고르는 조회와 만료된 lease 를 되찾는 조회가 이 두 색인을 탄다.
CREATE INDEX IF NOT EXISTS "experiment_executions_experiment_status"
    ON "experiment_executions" ("experiment_id", "status");

CREATE INDEX IF NOT EXISTS "experiment_executions_lease_expiry"
    ON "experiment_executions" ("lease_expires_at")
    WHERE "lease_expires_at" IS NOT NULL;

-- 시도 하나의 정산은 한 번만 적힌다. 워커가 같은 시도를 다시 정산해도 점수와 비용이 두 벌 쌓이지
-- 않도록 이 표의 기본 키가 승자를 정한다.
CREATE TABLE IF NOT EXISTS "evaluation_execution_settlements" (
    "execution_id" text NOT NULL,
    "attempt" integer NOT NULL,
    "job_id" text,
    "trace_id" text,
    "resolved_prompt_hash" text,
    "duration_ms" integer,
    "cost_usd" double precision NOT NULL DEFAULT 0,
    "settled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "evaluation_execution_settlements_pkey" PRIMARY KEY ("execution_id", "attempt")
);
