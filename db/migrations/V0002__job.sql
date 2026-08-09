CREATE TABLE IF NOT EXISTS "ai_jobs" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "kind" text NOT NULL,
    "executor" text NOT NULL,
    "status" text NOT NULL,
    "attempts" integer NOT NULL DEFAULT 0,
    "task_id" text,
    "idempotency_key" text,
    "idempotency_input_hash" text,
    "input" jsonb NOT NULL DEFAULT '{}',
    "result" jsonb NOT NULL DEFAULT '{}',
    "usage" jsonb NOT NULL DEFAULT '{}',
    "error" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "lease_owner" text,
    "lease_expires_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_jobs_idempotency_key"
    ON "ai_jobs" ("user_id", "kind", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ai_jobs_active_status_kind_executor"
    ON "ai_jobs" ("status", "kind", "executor") WHERE "status" IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS "ai_jobs_lease_expiry"
    ON "ai_jobs" ("lease_expires_at") WHERE "status" = 'running' AND "lease_expires_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ai_jobs_kind_status"
    ON "ai_jobs" ("kind", "status");
CREATE INDEX IF NOT EXISTS "ai_jobs_user_kind"
    ON "ai_jobs" ("user_id", "kind", "created_at");

CREATE TABLE IF NOT EXISTS "ai_job_steps" (
    "id" text NOT NULL,
    "job_id" text NOT NULL,
    "user_id" text NOT NULL,
    "attempt" integer NOT NULL DEFAULT 1,
    "seq" integer NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "truncated" boolean NOT NULL DEFAULT false,
    "tool_calls" jsonb,
    "tool_name" text,
    "tool_call_id" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer,
    "cache_creation_tokens" integer,
    "stop_reason" text,
    "node_name" text,
    "event_kind" text,
    "duration_ms" integer,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "ai_job_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_job_steps_user_created"
    ON "ai_job_steps" ("user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_job_steps_job_attempt_seq"
    ON "ai_job_steps" ("job_id", "attempt", "seq");

CREATE TABLE IF NOT EXISTS "agent_run_observations" (
    "execution_id" text NOT NULL,
    "attempt_id" text NOT NULL,
    "user_id" text NOT NULL,
    "job_id" text,
    "agent_name" text NOT NULL,
    "backend" text NOT NULL,
    "model_requested" text NOT NULL,
    "model_actual" text,
    "prompt_version" text NOT NULL,
    "tool_contract_version" text NOT NULL,
    "status" text NOT NULL,
    "duration_ms" integer NOT NULL,
    "usage" jsonb NOT NULL,
    "cost_usd" double precision,
    "landed" boolean NOT NULL,
    "repair_attempted" boolean NOT NULL,
    "validation" jsonb NOT NULL,
    "model_calls" jsonb NOT NULL,
    "tool_calls" jsonb NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "agent_run_observations_pkey" PRIMARY KEY ("execution_id", "attempt_id")
);

CREATE INDEX IF NOT EXISTS "agent_run_observations_user_created"
    ON "agent_run_observations" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_run_observations_job"
    ON "agent_run_observations" ("job_id");
