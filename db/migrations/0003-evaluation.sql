CREATE TABLE IF NOT EXISTS "evaluation_datasets" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "current_revision" integer NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "evaluation_datasets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_datasets_user_name"
    ON "evaluation_datasets" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "evaluator_definitions" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "kind" text NOT NULL,
    "version" text NOT NULL,
    "config" jsonb NOT NULL DEFAULT '{}',
    "implementation_hash" text NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "evaluator_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluator_definitions_name_version"
    ON "evaluator_definitions" ("name", "version");

CREATE TABLE IF NOT EXISTS "experiments" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "dataset_id" text NOT NULL,
    "dataset_revision" integer NOT NULL,
    "evaluator_set_version" text NOT NULL,
    "status" text NOT NULL,
    "max_budget_usd" double precision NOT NULL,
    "spent_usd" double precision NOT NULL DEFAULT '0',
    "repetitions" integer NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "experiments_user_created"
    ON "experiments" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "human_reviews" (
    "id" text NOT NULL,
    "experiment_id" text NOT NULL,
    "user_id" text NOT NULL,
    "execution_a_id" text NOT NULL,
    "execution_b_id" text NOT NULL,
    "preference" text NOT NULL,
    "corrected_output" jsonb,
    "reason" text,
    "reviewer_user_id" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "human_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "human_reviews_experiment"
    ON "human_reviews" ("experiment_id");

CREATE TABLE IF NOT EXISTS "prompt_fragment_definitions" (
    "id" text NOT NULL,
    "agent_name" text NOT NULL,
    "fragment_name" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "backend" text NOT NULL,
    "definition_key" text NOT NULL,
    "language" text NOT NULL,
    "code_name" text NOT NULL,
    CONSTRAINT "prompt_fragment_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_definitions_scope"
    ON "prompt_fragment_definitions" ("backend", "agent_name", "fragment_name", "language");
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_definitions_backend_key"
    ON "prompt_fragment_definitions" ("backend", "definition_key");
