CREATE TABLE IF NOT EXISTS "chat_threads" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "title" text NOT NULL,
    "summary" text,
    "backend" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_threads_user_updated"
    ON "chat_threads" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" text NOT NULL,
    "thread_id" text NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "tool_calls" jsonb,
    "tool_call_id" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_messages_thread_created"
    ON "chat_messages" ("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "chat_executions" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "thread_id" text NOT NULL,
    "user_message_id" text NOT NULL,
    "client_request_id" text NOT NULL,
    "input_hash" text NOT NULL,
    "status" text NOT NULL,
    "requested_backend" text,
    "model" text,
    "language" text,
    "draft_text" text NOT NULL DEFAULT '',
    "draft_seq" integer NOT NULL DEFAULT 0,
    "assistant_message_id" text,
    "error" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "attempt" integer NOT NULL DEFAULT 0,
    "draft_token_hash" text,
    "model_used" text,
    "cost_usd" double precision,
    "num_turns" integer,
    "usage" jsonb NOT NULL DEFAULT '{}',
    "stop_reason" text,
    CONSTRAINT "chat_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_executions_idempotency"
    ON "chat_executions" ("user_id", "thread_id", "client_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_executions_running_thread"
    ON "chat_executions" ("thread_id") WHERE "status" = 'running';
CREATE INDEX IF NOT EXISTS "chat_executions_user_status_updated"
    ON "chat_executions" ("user_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "chat_executions_thread_created"
    ON "chat_executions" ("thread_id", "created_at");

CREATE TABLE IF NOT EXISTS "chat_execution_steps" (
    "id" text NOT NULL,
    "execution_id" text NOT NULL,
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
    CONSTRAINT "chat_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_execution_steps_user_created"
    ON "chat_execution_steps" ("user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_execution_steps_execution_attempt_seq"
    ON "chat_execution_steps" ("execution_id", "attempt", "seq");

CREATE TABLE IF NOT EXISTS "chat_pending_tools" (
    "id" text NOT NULL,
    "thread_id" text NOT NULL,
    "message_id" text,
    "tool_name" text NOT NULL,
    "args" jsonb NOT NULL DEFAULT '{}',
    "status" text NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "resolved_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "chat_pending_tools_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_pending_tools_thread_status"
    ON "chat_pending_tools" ("thread_id", "status");

CREATE TABLE IF NOT EXISTS "chat_user_memories" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "key" text NOT NULL,
    "content" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "chat_user_memories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_user_memories_unique"
    ON "chat_user_memories" ("user_id", "key");
