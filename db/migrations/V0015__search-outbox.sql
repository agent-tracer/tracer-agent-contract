-- OpenSearch 쓰기는 원장 트랜잭션에 참여하지 못하므로 색인 반영 요청을 같은 커밋에 행으로 남기고
-- 배출기가 뒤에서 재시도한다. 표의 모양은 추적의 같은 이름 표에서 옮겨 왔다.
CREATE TABLE IF NOT EXISTS "search_outbox" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "target" text NOT NULL,
    "target_id" text NOT NULL,
    "attempts" integer NOT NULL DEFAULT 0,
    "last_error" text,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "search_outbox_pkey" PRIMARY KEY ("id"),
    -- 에이전트 원장이 소유한 색인 대상은 레시피 하나다. 태스크와 메모는 추적이 자기 원장에서 배출한다.
    CONSTRAINT "search_outbox_target_check" CHECK ("target" = 'recipe')
);

CREATE INDEX IF NOT EXISTS "search_outbox_created"
    ON "search_outbox" ("created_at");
