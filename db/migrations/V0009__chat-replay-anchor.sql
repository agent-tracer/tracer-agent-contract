-- 실행 행이 든 메시지 식별자는 재생 창을 어디서 끊을지 정하는 앵커다. 사용자 발화뿐 아니라
-- 승인이 적재한 도구 결과도 그 자리에 서므로 칸의 이름이 역할을 그대로 말해야 한다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'chat_executions' AND column_name = 'user_message_id'
    ) THEN
        ALTER TABLE "chat_executions"
            RENAME COLUMN "user_message_id" TO "replay_anchor_message_id";
    END IF;
END $$;
