-- 백엔드는 backend 칸 하나가 나르므로 조각의 키와 코드 이름에서 그것을 말하는 자리를 뗀다.
UPDATE "prompt_fragment_definitions"
SET "definition_key" = regexp_replace("definition_key", '^(sdk|lan)\.', ''),
    "code_name" = regexp_replace("code_name", '^(SDK|LAN)_', '')
WHERE "definition_key" ~ '^(sdk|lan)\.' OR "code_name" ~ '^(SDK|LAN)_';

-- 코드 이름은 에이전트와 자리를 함께 담아 두 백엔드가 같은 자리에 같은 이름을 쓴다.
UPDATE "prompt_fragment_definitions"
SET "code_name" = upper(replace(replace("agent_name", '-', '_'), '.', '_')) || '_' || "code_name"
WHERE "code_name" NOT LIKE upper(replace(replace("agent_name", '-', '_'), '.', '_')) || '\_%';

UPDATE "prompt_fragment_bindings"
SET "template_key" = regexp_replace("template_key", '^(sdk|lan)\.', '')
WHERE "template_key" ~ '^(sdk|lan)\.';

-- 두 백엔드가 같은 에이전트의 같은 자리를 올리므로 유일성이 backend를 포함해야 서로를 덮지 않는다.
ALTER TABLE "prompt_fragment_bindings" ADD COLUMN IF NOT EXISTS "backend" text;

UPDATE "prompt_fragment_bindings" AS b
SET "backend" = d."backend"
FROM "prompt_fragment_definitions" AS d
WHERE b."definition_id" = d."id" AND b."backend" IS NULL;

DELETE FROM "prompt_fragment_bindings" WHERE "backend" IS NULL;

ALTER TABLE "prompt_fragment_bindings" ALTER COLUMN "backend" SET NOT NULL;

DROP INDEX IF EXISTS "prompt_fragment_definitions_key";
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_definitions_backend_key"
    ON "prompt_fragment_definitions" ("backend", "definition_key");

DROP INDEX IF EXISTS "prompt_fragment_bindings_slot";
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_fragment_bindings_backend_slot"
    ON "prompt_fragment_bindings" ("backend", "template_key", "fragment_slot");

-- 궤적의 역할은 모델도 도구도 아닌 단계를 실행을 엮는 층의 이름으로 부른다.
UPDATE "ai_job_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
UPDATE "chat_execution_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
