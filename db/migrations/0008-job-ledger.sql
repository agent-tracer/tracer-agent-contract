-- 잡 실행 원장은 ai_jobs 한 행과 그에 매달린 ai_job_steps 여러 행뿐이며, 실행 하나를 통째로
-- 담던 표는 원장에 속하지 않으므로 이미 그 표를 가진 데이터베이스에서 내린다.
DROP INDEX IF EXISTS "graph_job_executions_user_kind_task";
DROP INDEX IF EXISTS "graph_job_executions_kind_status";
DROP INDEX IF EXISTS "graph_job_executions_idempotency";
DROP TABLE IF EXISTS "graph_job_executions";
