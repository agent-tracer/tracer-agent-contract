import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkContractVersions, checkMigrationOrder } from "./check-contract-files.mjs";

describe("migration 이름과 번호", () => {
  it("0001부터 하나씩 오르는 목록을 통과시킨다", () => {
    assert.deepEqual(checkMigrationOrder(["0001-chat.sql", "0002-job.sql", "0003-settings.sql"]), []);
  });

  it("순서가 뒤섞여 있어도 번호만 이어지면 통과시킨다", () => {
    assert.deepEqual(checkMigrationOrder(["0003-settings.sql", "0001-chat.sql", "0002-job.sql"]), []);
  });

  it("번호가 빠지면 거부한다", () => {
    const errors = checkMigrationOrder(["0001-chat.sql", "0003-settings.sql"]);
    assert.ok(errors.some((error) => error.includes("이어지지 않는다")));
  });

  it("번호가 겹치면 거부한다", () => {
    const errors = checkMigrationOrder(["0001-chat.sql", "0001-job.sql"]);
    assert.ok(errors.some((error) => error.includes("이어지지 않는다")));
  });

  it("이름 규칙을 벗어난 파일을 거부한다", () => {
    const errors = checkMigrationOrder(["0001-chat.sql", "job.sql"]);
    assert.ok(errors.some((error) => error.includes("NNNN-소문자-이름.sql")));
  });

  it("대문자가 섞인 이름을 거부한다", () => {
    const errors = checkMigrationOrder(["0001-Chat.sql"]);
    assert.ok(errors.some((error) => error.includes("NNNN-소문자-이름.sql")));
  });
});

describe("에이전트 계약의 판", () => {
  it("조각과 템플릿의 판이 vX.Y.Z 면 통과시킨다", () => {
    const document = {
      version: "v0.0.1",
      fragments: { one: { version: "v1.2.3" } },
      templates: { "a.b.system": { version: "v0.10.0" } },
    };
    assert.deepEqual(checkContractVersions("agent/a/prompt.json", document), []);
  });

  it("접두사 v 가 없는 판을 거부한다", () => {
    const errors = checkContractVersions("agent/a/tool.json", { version: "0.0.1" });
    assert.ok(errors.some((error) => error.includes("vX.Y.Z")));
  });

  it("자리가 모자란 판을 거부한다", () => {
    const errors = checkContractVersions("agent/a/prompt.json", { fragments: { one: { version: "v1" } } });
    assert.ok(errors.some((error) => error.includes("vX.Y.Z")));
  });
});
