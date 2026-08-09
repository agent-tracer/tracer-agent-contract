-- 요약 본문만 있고 그 요약이 어디까지를 접었는지 원장이 몰라서, 한 축이 요약을 쓴 뒤 다른 축이
-- 여러 턴을 처리하면 그 사이가 어느 쪽에도 실리지 않았다. 접은 마지막 메시지를 함께 적는다.
ALTER TABLE "chat_threads"
    ADD COLUMN IF NOT EXISTS "summary_through_message_id" text;

-- 요약과 그 지점은 한 문장으로 갱신되므로 한쪽만 있는 행은 읽는 쪽이 다룰 필요가 없다.
-- 제약을 두지 않으면 두 축이 그 갈래를 위한 되돌림을 영구히 들고 다닌다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'chat_threads' AND constraint_name = 'chat_threads_summary_pairing'
    ) THEN
        ALTER TABLE "chat_threads"
            ADD CONSTRAINT "chat_threads_summary_pairing"
            CHECK (("summary" IS NULL) = ("summary_through_message_id" IS NULL));
    END IF;
END $$;
