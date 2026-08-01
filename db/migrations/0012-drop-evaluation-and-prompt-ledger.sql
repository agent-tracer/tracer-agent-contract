-- 실행 원장은 실행이 무엇을 썼는지만 담고 그 실행이 어느 실험의 것이었는지는 담지 않는다.
ALTER TABLE "agent_run_observations" DROP COLUMN IF EXISTS "experiment_id";
ALTER TABLE "agent_run_observations" DROP COLUMN IF EXISTS "example_id";
ALTER TABLE "agent_run_observations" DROP COLUMN IF EXISTS "variant_id";
ALTER TABLE "agent_run_observations" DROP COLUMN IF EXISTS "evaluator_set_version";

DROP TABLE IF EXISTS "evaluation_execution_settlements";
DROP TABLE IF EXISTS "evaluation_scores";
DROP TABLE IF EXISTS "human_review_revisions";
DROP TABLE IF EXISTS "human_reviews";
DROP TABLE IF EXISTS "experiment_executions";
DROP TABLE IF EXISTS "experiment_variants";
DROP TABLE IF EXISTS "experiments";
DROP TABLE IF EXISTS "evaluator_set_members";
DROP TABLE IF EXISTS "evaluator_sets";
DROP TABLE IF EXISTS "evaluator_definitions";
DROP TABLE IF EXISTS "evaluation_examples";
DROP TABLE IF EXISTS "evaluation_datasets";

-- 프롬프트의 본문은 코드가 갖고 실행은 그것을 그대로 조립한다.
DROP TABLE IF EXISTS "prompt_fragment_channels";
DROP TABLE IF EXISTS "prompt_fragment_bindings";
DROP TABLE IF EXISTS "prompt_fragment_versions";
DROP TABLE IF EXISTS "prompt_fragment_definitions";
DROP TABLE IF EXISTS "prompt_promotions";
DROP TABLE IF EXISTS "prompt_channels";
DROP TABLE IF EXISTS "prompt_versions";
DROP TABLE IF EXISTS "prompt_definitions";
