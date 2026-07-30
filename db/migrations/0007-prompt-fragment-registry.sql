-- 조각 정의 하나가 갖는 판이며 워커가 부팅에 올린 파일 기본값도 여기 들어온다.
CREATE TABLE IF NOT EXISTS "prompt_fragment_versions" (
    "id" text NOT NULL,
    "definition_id" text NOT NULL,
    "semantic_version" text NOT NULL,
    "content" text NOT NULL,
    "content_hash" text NOT NULL,
    "placeholders" jsonb NOT NULL DEFAULT '[]',
    "tool_contract_version" text NOT NULL,
    "output_schema_version" text NOT NULL,
    "origin" text NOT NULL,
    "previous_version_id" text,
    "change_summary" text,
    "created_by" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_fragment_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_versions_scope"
    ON "prompt_fragment_versions" ("definition_id", "semantic_version");

-- 조각이 어느 템플릿의 어느 자리를 채우는지이며 한 정의가 여러 자리에 꽂힐 수 있다.
CREATE TABLE IF NOT EXISTS "prompt_fragment_bindings" (
    "id" text NOT NULL,
    "backend" text NOT NULL,
    "template_key" text NOT NULL,
    "fragment_slot" text NOT NULL,
    "definition_id" text NOT NULL,
    "code_default_version" text NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_fragment_bindings_pkey" PRIMARY KEY ("id")
);

-- 이 표가 backend 칸 없이 선 배포에서는 정의가 그 값을 알고 있으므로 거기서 받아 채운다.
ALTER TABLE "prompt_fragment_bindings" ADD COLUMN IF NOT EXISTS "backend" text;

UPDATE "prompt_fragment_bindings" AS b
SET "backend" = d."backend"
FROM "prompt_fragment_definitions" AS d
WHERE b."definition_id" = d."id" AND b."backend" IS NULL;

DELETE FROM "prompt_fragment_bindings" WHERE "backend" IS NULL;

ALTER TABLE "prompt_fragment_bindings" ALTER COLUMN "backend" SET NOT NULL;

-- 두 백엔드가 같은 에이전트의 같은 자리를 올리므로 유일성이 backend 를 포함해야 서로를 덮지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_bindings_backend_slot"
    ON "prompt_fragment_bindings" ("backend", "template_key", "fragment_slot");

-- 채널마다 지금 실행에 쓰이는 판을 가리키며 부팅 해소가 이 행을 읽는다.
CREATE TABLE IF NOT EXISTS "prompt_fragment_channels" (
    "id" text NOT NULL,
    "definition_id" text NOT NULL,
    "channel" text NOT NULL,
    "version_id" text NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "prompt_fragment_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_channels_scope"
    ON "prompt_fragment_channels" ("definition_id", "channel");
