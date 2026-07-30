-- 에이전트가 실행에 쓰는 프롬프트의 판과 채널이며 워커가 부팅 때 코드의 판과 대조한다.
CREATE TABLE IF NOT EXISTS "prompt_definitions" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "agent_name" text NOT NULL,
    "backend" text NOT NULL,
    "language" text NOT NULL,
    "name" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_definitions_scope"
    ON "prompt_definitions" ("user_id", "agent_name", "backend", "language", "name");

CREATE TABLE IF NOT EXISTS "prompt_versions" (
    "id" text NOT NULL,
    "definition_id" text NOT NULL,
    "semantic_version" text NOT NULL,
    "content" text NOT NULL,
    "content_hash" text NOT NULL,
    "tool_contract_version" text NOT NULL,
    "output_schema_version" text NOT NULL,
    "content_origin" text NOT NULL,
    "created_by" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_definition_content"
    ON "prompt_versions" ("definition_id", "content_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_definition_semver"
    ON "prompt_versions" ("definition_id", "semantic_version");

CREATE TABLE IF NOT EXISTS "prompt_channels" (
    "id" text NOT NULL,
    "definition_id" text NOT NULL,
    "channel" text NOT NULL,
    "version_id" text NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_channels_definition_channel"
    ON "prompt_channels" ("definition_id", "channel");

CREATE TABLE IF NOT EXISTS "prompt_promotions" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "prompt_version_id" text NOT NULL,
    "experiment_id" text NOT NULL,
    "from_channel" text,
    "to_channel" text NOT NULL,
    "gate_result" jsonb NOT NULL,
    "promoted_by" text NOT NULL,
    "promoted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_promotions_target"
    ON "prompt_promotions" ("prompt_version_id", "experiment_id", "to_channel");

CREATE TABLE IF NOT EXISTS "experiment_variants" (
    "id" text NOT NULL,
    "experiment_id" text NOT NULL,
    "name" text NOT NULL,
    "backend" text NOT NULL,
    "model" text NOT NULL,
    "prompt_version_id" text NOT NULL,
    "tool_contract_version" text NOT NULL,
    "limits" jsonb NOT NULL DEFAULT '{}',
    "baseline" boolean NOT NULL DEFAULT false,
    CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id")
);

-- 워커가 자기 프롬프트 판을 대조하는 창구이며 production 채널의 시스템 기본 판만 비춘다.
CREATE OR REPLACE VIEW "agent_prompt_registry_view" AS
SELECT
    d.agent_name AS agent_name,
    d.backend AS backend,
    v.semantic_version AS semantic_version,
    v.content_hash AS content_hash
FROM prompt_channels c
JOIN prompt_definitions d ON d.id = c.definition_id
JOIN prompt_versions v ON v.id = c.version_id AND v.definition_id = c.definition_id
WHERE c.channel = 'production' AND d.user_id = 'system' AND d.name = 'default';
