-- 두 백엔드가 같은 에이전트의 같은 자리를 올리므로 자리도 backend 로 갈라져야 서로를 덮지 않는다.
ALTER TABLE "prompt_fragment_bindings" ADD COLUMN IF NOT EXISTS "backend" text;

UPDATE "prompt_fragment_bindings" AS b
SET "backend" = d."backend"
FROM "prompt_fragment_definitions" AS d
WHERE b."definition_id" = d."id" AND b."backend" IS NULL;

DELETE FROM "prompt_fragment_bindings" WHERE "backend" IS NULL;

ALTER TABLE "prompt_fragment_bindings" ALTER COLUMN "backend" SET NOT NULL;

-- 이름에서 백엔드가 빠지면 두 축의 키가 같아지므로 backend 없는 유일 인덱스를 먼저 내린다.
DROP INDEX IF EXISTS "prompt_fragment_definitions_key";
DROP INDEX IF EXISTS "prompt_fragment_bindings_slot";

-- 백엔드를 나르는 것은 backend 칸 하나이며 키와 코드 이름은 에이전트와 자리에서만 나온다.
UPDATE "prompt_fragment_definitions"
SET "definition_key" = "agent_name" || '.'
        || lower(regexp_replace("fragment_name", '([a-z0-9])([A-Z])', '\1-\2', 'g')) || '.' || "language",
    "code_name" = upper(replace("agent_name", '-', '_')) || '_'
        || upper(regexp_replace("fragment_name", '([a-z0-9])([A-Z])', '\1_\2', 'g'));

UPDATE "prompt_fragment_bindings"
SET "template_key" = regexp_replace("template_key", '^(sdk|lan)\.', '')
WHERE "template_key" ~ '^(sdk|lan)\.';

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_definitions_backend_key"
    ON "prompt_fragment_definitions" ("backend", "definition_key");

CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_bindings_backend_slot"
    ON "prompt_fragment_bindings" ("backend", "template_key", "fragment_slot");

-- 궤적의 역할은 모델도 도구도 아닌 단계를 실행을 엮는 층의 이름으로 부른다.
UPDATE "ai_job_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
UPDATE "chat_execution_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
