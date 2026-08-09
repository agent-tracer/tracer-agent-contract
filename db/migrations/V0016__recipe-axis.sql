-- 배경 작업이 만드는 행도 어느 축이 만들었는지를 원장에 적는다. 두 축이 같은 agent-db 를 볼 때
-- 축이 행에 없으면 한 축이 상대 축의 행을 자기 것으로 읽는다. 이미 쌓인 행은 정본 축이 만든
-- 것이라 ts 로 채우고 그 뒤로는 만드는 자리가 값을 적어야 하므로 기본값을 내린다.
ALTER TABLE "recipe_applications" ADD COLUMN IF NOT EXISTS "backend" text NOT NULL DEFAULT 'ts';
ALTER TABLE "recipe_applications" ALTER COLUMN "backend" DROP DEFAULT;
ALTER TABLE "recipe_applications"
  DROP CONSTRAINT IF EXISTS "recipe_applications_backend_check";
ALTER TABLE "recipe_applications"
  ADD CONSTRAINT "recipe_applications_backend_check"
  CHECK ("backend" IN ('ts', 'python'));

-- V0013 이 이 표에 건 유일 제약은 id 의 기본 키 하나뿐이다. 그 id 는 사건이 싣고 오는 값이라
-- 두 축이 같은 사건에서 같은 값을 얻는다. 축을 앞에 두지 않으면 뒤에 투영한 축이 앞선 축의
-- 행을 덮으므로 그 유일 제약을 축까지 넓힌다.
ALTER TABLE "recipe_applications" DROP CONSTRAINT IF EXISTS "recipe_applications_pkey";
ALTER TABLE "recipe_applications"
  ADD CONSTRAINT "recipe_applications_pkey" PRIMARY KEY ("backend", "id");

-- 같은 태스크에 같은 레시피의 행을 하나로 묶는 것은 프로젝터의 alreadyOpen 검사이며 원장이
-- 아니다. V0013 에 없던 유일 제약을 여기서 세우면 지금 성공하는 쓰기가 원장 오류가 되므로
-- (backend, user_id, task_id, recipe_id) 의 유일 제약은 세우지 않는다.

-- 적용 이력을 읽는 질의가 모두 축을 먼저 거르므로 색인의 첫 칸을 축으로 바꾼다. 축이 뒤에
-- 오는 색인은 축을 거르는 질의가 쓰지 못한다.
DROP INDEX IF EXISTS "recipe_applications_task";
DROP INDEX IF EXISTS "recipe_applications_recipe";
CREATE INDEX IF NOT EXISTS "recipe_applications_axis_task"
    ON "recipe_applications" ("backend", "task_id");
CREATE INDEX IF NOT EXISTS "recipe_applications_axis_recipe"
    ON "recipe_applications" ("backend", "recipe_id", "created_at");

-- 배출기는 자기 축이 적재한 행만 소진한다. 축이 없으면 한 축이 상대 축의 행을 가져가 상대 축의
-- 원장으로 자기 색인 문서를 덮는다.
ALTER TABLE "search_outbox" ADD COLUMN IF NOT EXISTS "backend" text NOT NULL DEFAULT 'ts';
ALTER TABLE "search_outbox" ALTER COLUMN "backend" DROP DEFAULT;
ALTER TABLE "search_outbox"
  DROP CONSTRAINT IF EXISTS "search_outbox_backend_check";
ALTER TABLE "search_outbox"
  ADD CONSTRAINT "search_outbox_backend_check"
  CHECK ("backend" IN ('ts', 'python'));

-- 아웃박스 행의 식별자는 적재하는 축이 스스로 만들므로 두 축이 같은 값을 얻지 않는다.
-- 그래서 이 표의 기본 키는 id 하나로 둔다.

DROP INDEX IF EXISTS "search_outbox_created";
CREATE INDEX IF NOT EXISTS "search_outbox_axis_created"
    ON "search_outbox" ("backend", "created_at");
