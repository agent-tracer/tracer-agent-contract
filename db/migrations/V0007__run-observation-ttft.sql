-- 첫 토큰까지의 시간은 스트리밍으로 답을 흘리는 실행만 잴 수 있고 한 번에 받아 오는 실행은
-- 잴 자리가 없으므로, 두 구현체가 같은 원장에 적되 재지 못한 실행은 이 칸을 비운다.
ALTER TABLE "agent_run_observations" ADD COLUMN IF NOT EXISTS "ttft_ms" integer;
