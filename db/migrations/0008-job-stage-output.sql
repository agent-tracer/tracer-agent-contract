-- 잡 실행 하나가 여러 단계로 나뉘고 그 사이에서 끊길 수 있으므로, 끝난 단계의 산출을 원장에
-- 적어 다시 시도한 실행이 앞선 단계를 다시 태우지 않는다. slot 은 같은 단계가 팬아웃과 재파견
-- 으로 여러 번 도는 자리를 가른다.
CREATE TABLE IF NOT EXISTS "ai_job_stage_outputs" (
    "job_id" varchar(64) NOT NULL,
    "stage" varchar(32) NOT NULL,
    "slot" varchar(128) NOT NULL,
    "payload" jsonb NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "ai_job_stage_outputs_pk" PRIMARY KEY ("job_id", "stage", "slot")
);

CREATE INDEX IF NOT EXISTS "ai_job_stage_outputs_job" ON "ai_job_stage_outputs" ("job_id");
