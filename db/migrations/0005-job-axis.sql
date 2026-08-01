-- 잡의 축은 접수구가 받는 순간 정해지므로 원장의 모든 행이 그 값을 갖는다. 이미 쌓인 행은
-- 정본 접수구가 받은 것이라 ts 로 채우고, 그 뒤로는 접수가 값을 적어야 하므로 기본값을 내린다.
ALTER TABLE "ai_jobs" ADD COLUMN IF NOT EXISTS "backend" text NOT NULL DEFAULT 'ts';
ALTER TABLE "ai_jobs" ALTER COLUMN "backend" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "ai_jobs_active_backend"
    ON "ai_jobs" ("backend", "kind") WHERE "status" IN ('pending', 'running');
