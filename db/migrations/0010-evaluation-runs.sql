CREATE TABLE IF NOT EXISTS "evaluation_examples" (
    "id" text NOT NULL,
    "dataset_id" text NOT NULL,
    "revision" integer NOT NULL,
    "input" jsonb NOT NULL,
    "reference_output" jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}',
    "disclosure_class" text NOT NULL,
    "source_execution_id" text,
    "content_hash" text NOT NULL,
    "evidence" jsonb NOT NULL DEFAULT '{}',
    "enabled" boolean NOT NULL DEFAULT true,
    CONSTRAINT "evaluation_examples_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_examples_dataset_revision_hash"
    ON "evaluation_examples" ("dataset_id", "revision", "content_hash");

CREATE INDEX IF NOT EXISTS "evaluation_examples_dataset_revision"
    ON "evaluation_examples" ("dataset_id", "revision");

CREATE TABLE IF NOT EXISTS "experiment_executions" (
    "id" text NOT NULL,
    "experiment_id" text NOT NULL,
    "variant_id" text NOT NULL,
    "example_id" text NOT NULL,
    "repetition" integer NOT NULL,
    "status" text NOT NULL,
    "output" jsonb,
    "error" text,
    "cost_usd" double precision NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "experiment_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "experiment_executions_variant_example_repetition"
    ON "experiment_executions" ("variant_id", "example_id", "repetition");

CREATE INDEX IF NOT EXISTS "experiment_executions_experiment"
    ON "experiment_executions" ("experiment_id", "id");

CREATE TABLE IF NOT EXISTS "evaluation_scores" (
    "id" text NOT NULL,
    "execution_id" text NOT NULL,
    "evaluator_id" text NOT NULL,
    "evaluator_version" text NOT NULL,
    "score" double precision NOT NULL,
    "label" text,
    "reason" text,
    "judge_cost_usd" double precision NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "evaluation_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_scores_execution_evaluator"
    ON "evaluation_scores" ("execution_id", "evaluator_id", "evaluator_version");

CREATE TABLE IF NOT EXISTS "evaluator_sets" (
    "id" text NOT NULL,
    "version" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "evaluator_sets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluator_sets_version"
    ON "evaluator_sets" ("version");

CREATE TABLE IF NOT EXISTS "evaluator_set_members" (
    "id" text NOT NULL,
    "set_id" text NOT NULL,
    "evaluator_definition_id" text NOT NULL,
    "ordinal" integer NOT NULL,
    CONSTRAINT "evaluator_set_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluator_set_members_set_ordinal"
    ON "evaluator_set_members" ("set_id", "ordinal");

CREATE TABLE IF NOT EXISTS "human_review_revisions" (
    "id" text NOT NULL,
    "review_id" text NOT NULL,
    "preference" text NOT NULL,
    "reason" text,
    "corrected_output" jsonb,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "human_review_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "human_review_revisions_review"
    ON "human_review_revisions" ("review_id", "created_at");
