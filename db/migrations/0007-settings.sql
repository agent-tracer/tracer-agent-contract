-- 에이전트가 자기 실행에 쓰는 설정값이며 scope 와 key 한 쌍이 값 하나를 가리킨다.
CREATE TABLE IF NOT EXISTS "app_settings" (
    "scope" text NOT NULL,
    "key" text NOT NULL,
    "value" text NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("scope", "key")
);
