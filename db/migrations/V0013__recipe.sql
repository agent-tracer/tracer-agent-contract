-- 레시피를 만드는 주체가 에이전트이므로 레시피 원장은 에이전트 원장에 선다. 열과 기본값과 색인은
-- 추적이 쓰던 것과 같으며 그 자리에서 옮겨 온 값이다.
CREATE TABLE IF NOT EXISTS "recipes" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "status" text NOT NULL,
    "title" text NOT NULL,
    "intent" text NOT NULL,
    "description" text NOT NULL,
    "use_when" jsonb NOT NULL DEFAULT '[]',
    "summary_md" text NOT NULL,
    "request" text NOT NULL DEFAULT '',
    "inputs" jsonb NOT NULL DEFAULT '[]',
    "outputs" jsonb NOT NULL DEFAULT '[]',
    "corrections" jsonb NOT NULL DEFAULT '[]',
    "pitfalls" jsonb NOT NULL DEFAULT '[]',
    "recovery" jsonb NOT NULL DEFAULT '[]',
    "governing_rules" jsonb NOT NULL DEFAULT '[]',
    "steps" jsonb NOT NULL DEFAULT '[]',
    "touched_files" jsonb NOT NULL DEFAULT '[]',
    "contributing_slices" jsonb NOT NULL DEFAULT '[]',
    "rationale" text,
    "language" text,
    "rev" integer NOT NULL DEFAULT 1,
    "parent_recipe_id" text,
    "source_job_id" text,
    "user_edited" boolean NOT NULL DEFAULT false,
    "last_edited_by" text NOT NULL DEFAULT 'agent',
    "error" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "resolved_at" TIMESTAMP WITH TIME ZONE,
    "deleted_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- 목록 창구는 지워진 행을 빼고 읽으므로 그 조건을 그대로 담은 색인을 따로 둔다.
CREATE INDEX IF NOT EXISTS "recipes_live_user_status"
    ON "recipes" ("user_id", "status", "updated_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "recipes_user_status"
    ON "recipes" ("user_id", "status", "updated_at");

-- 레시피 하나가 어느 태스크에 쓰였고 그 결과가 무엇이었는지를 한 행으로 적는다.
CREATE TABLE IF NOT EXISTS "recipe_applications" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "recipe_id" text NOT NULL,
    "task_id" text NOT NULL,
    "injected_via" text NOT NULL,
    "outcome" text,
    "note" text,
    "anchor_event_id" text,
    "anchor_seq" bigint,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "recipe_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recipe_applications_task"
    ON "recipe_applications" ("task_id");
CREATE INDEX IF NOT EXISTS "recipe_applications_recipe"
    ON "recipe_applications" ("recipe_id", "created_at");
