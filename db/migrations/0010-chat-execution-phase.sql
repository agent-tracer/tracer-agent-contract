-- 사고 블록과 도구 인자 스트리밍과 도구 실행 중에는 초안이 자라지 않아 화면이 멈춘 것처럼 보인다.
-- 실행이 무엇을 하는 중인지를 한 칸에 적어 그 구간에도 살아 있음을 보이며, 값의 목록은
-- 계약의 conformance/cases/chat.query.json 의 executionPhase 가 갖는다.
ALTER TABLE "chat_executions" ADD COLUMN IF NOT EXISTS "phase" text NOT NULL DEFAULT 'starting';
