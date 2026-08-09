-- 초안 검사점을 두 구현체가 원장에 직접 적게 되어 그 창구를 부르는 자리가 없어졌다. 창구가 없으면
-- 그 자격의 지문도 아무것도 지키지 않으므로 칼럼을 지운다. 두 축이 이 칸을 쓰는 코드를 먼저 걷었다.
ALTER TABLE "chat_executions" DROP COLUMN IF EXISTS "draft_token_hash";
