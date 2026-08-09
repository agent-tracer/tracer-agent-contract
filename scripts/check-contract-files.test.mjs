import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkContractVersions,
  checkMigrationOrder,
  checkPromptPlaceholders,
} from "./check-contract-files.mjs";

describe("migration 이름과 번호", () => {
  it("0001부터 하나씩 오르는 목록을 통과시킨다", () => {
    assert.deepEqual(checkMigrationOrder(["V0001__chat.sql", "V0002__job.sql", "V0003__settings.sql"]), []);
  });

  it("순서가 뒤섞여 있어도 번호만 이어지면 통과시킨다", () => {
    assert.deepEqual(checkMigrationOrder(["V0003__settings.sql", "V0001__chat.sql", "V0002__job.sql"]), []);
  });

  it("번호가 빠지면 거부한다", () => {
    const errors = checkMigrationOrder(["V0001__chat.sql", "V0003__settings.sql"]);
    assert.ok(errors.some((error) => error.includes("이어지지 않는다")));
  });

  it("번호가 겹치면 거부한다", () => {
    const errors = checkMigrationOrder(["V0001__chat.sql", "V0001__job.sql"]);
    assert.ok(errors.some((error) => error.includes("이어지지 않는다")));
  });

  it("이름 규칙을 벗어난 파일을 거부한다", () => {
    const errors = checkMigrationOrder(["V0001__chat.sql", "job.sql"]);
    assert.ok(errors.some((error) => error.includes("VNNNN__소문자-이름.sql")));
  });

  it("대문자가 섞인 이름을 거부한다", () => {
    const errors = checkMigrationOrder(["V0001__Chat.sql"]);
    assert.ok(errors.some((error) => error.includes("VNNNN__소문자-이름.sql")));
  });

  it("접두 V 와 구분자 __ 가 없는 예전 이름을 거부한다", () => {
    const errors = checkMigrationOrder(["0001-chat.sql"]);
    assert.ok(errors.some((error) => error.includes("VNNNN__소문자-이름.sql")));
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

describe("프롬프트 조각의 자리표시자", () => {
  it("선언과 본문이 같으면 통과시킨다", () => {
    const document = {
      fragments: { one: { content: ["최대 ${max} 자"], placeholders: ["max"] } },
    };
    assert.deepEqual(checkPromptPlaceholders("agent/a/prompt.json", document), []);
  });

  it("자리표시자가 없고 선언도 없으면 통과시킨다", () => {
    assert.deepEqual(
      checkPromptPlaceholders("agent/a/prompt.json", { fragments: { one: { content: ["본문"] } } }),
      [],
    );
  });

  it("언어별 본문이 쓴 자리표시자도 선언을 요구한다", () => {
    const document = {
      fragments: { one: { byLanguage: { ko: ["최대 ${max} 자"], auto: ["at most ${max}"] } } },
    };
    const errors = checkPromptPlaceholders("agent/a/prompt.json", document);
    assert.ok(errors.some((error) => error.includes("선언하지 않은")));
  });

  it("본문이 쓰지 않는 선언을 거부한다", () => {
    const document = { fragments: { one: { content: ["본문"], placeholders: ["gone"] } } };
    const errors = checkPromptPlaceholders("agent/a/prompt.json", document);
    assert.ok(errors.some((error) => error.includes("쓰지 않는")));
  });
});
