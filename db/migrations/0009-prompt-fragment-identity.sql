-- backend 를 모르는 유일 인덱스가 남은 배포에서는 두 축의 키가 같아지는 순간 이관이 막힌다.
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

-- 궤적의 역할은 모델도 도구도 아닌 단계를 실행을 엮는 층의 이름으로 부른다.
UPDATE "ai_job_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
UPDATE "chat_execution_steps" SET "role" = 'orchestration' WHERE "role" = 'graph';
