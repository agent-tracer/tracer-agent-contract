#!/usr/bin/env node
// 적합성 검사기가 읽지 않는 계약 파일까지 문법과 이름 규칙을 검사한다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// 이름은 Flyway 가 판과 설명을 가르는 자리이므로 접두 V 와 구분자 __ 를 그대로 쓴다.
const MIGRATION_PATTERN = /^V(\d{4})__[a-z0-9-]+\.sql$/;
const CONTRACT_VERSION_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PLACEHOLDER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" }).trim().split("\n");
}

/** 번호가 0001부터 빠짐없이 하나씩 오르는지 검사한다. */
export function checkMigrationOrder(fileNames) {
  const errors = [];
  const numbered = [];

  for (const name of fileNames) {
    const matched = MIGRATION_PATTERN.exec(name);
    if (matched === null) {
      errors.push(`migration 이름이 VNNNN__소문자-이름.sql 이 아니다: ${name}`);
      continue;
    }
    numbered.push({ name, number: Number.parseInt(matched[1], 10) });
  }

  numbered.sort((left, right) => left.number - right.number);
  numbered.forEach((entry, index) => {
    const expected = index + 1;
    if (entry.number !== expected) {
      errors.push(`migration 번호가 이어지지 않는다: ${entry.name} 자리에 ${String(expected).padStart(4, "0")} 이 와야 한다`);
    }
  });

  return errors;
}

/** 에이전트 계약이 적은 판이 v<major>.<minor>.<patch> 인지 검사한다. */
export function checkContractVersions(label, document) {
  return collectVersions(document).flatMap((version) =>
    CONTRACT_VERSION_PATTERN.test(version) ? [] : [`${label} 의 판이 vX.Y.Z 가 아니다: "${version}"`],
  );
}

function collectVersions(value) {
  if (Array.isArray(value)) return value.flatMap(collectVersions);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    key === "version" && typeof nested === "string" ? [nested] : collectVersions(nested),
  );
}

/** 조각이 선언한 자리표시자와 본문이 쓴 자리표시자가 같은지 검사한다. */
export function checkPromptPlaceholders(label, document) {
  const errors = [];
  for (const [name, fragment] of Object.entries(document.fragments ?? {})) {
    const lines = [...(fragment.content ?? []), ...Object.values(fragment.byLanguage ?? {}).flat()];
    const used = new Set([...lines.join("\n").matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]));
    const declared = new Set(fragment.placeholders ?? []);
    const undeclared = [...used].filter((one) => !declared.has(one)).sort();
    const unused = [...declared].filter((one) => !used.has(one)).sort();

    if (undeclared.length > 0) {
      errors.push(`${label} 의 ${name} 이 선언하지 않은 자리표시자를 쓴다: ${undeclared.join(", ")}`);
    }
    if (unused.length > 0) {
      errors.push(`${label} 의 ${name} 이 쓰지 않는 자리표시자를 선언한다: ${unused.join(", ")}`);
    }
  }
  return errors;
}

function checkJson(files) {
  const errors = [];
  for (const file of files) {
    try {
      const document = JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
      if (file.startsWith("agent/")) errors.push(...checkContractVersions(file, document));
      if (file.endsWith("/prompt.json")) errors.push(...checkPromptPlaceholders(file, document));
    } catch (cause) {
      errors.push(`${file} 이 JSON 으로 읽히지 않는다: ${cause.message}`);
    }
  }
  return errors;
}

function checkVersion() {
  const version = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
  return SEMVER_PATTERN.test(version) ? [] : [`VERSION 이 X.Y.Z 가 아니다: "${version}"`];
}

function main() {
  const files = trackedFiles();
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const migrations = files
    .filter((file) => file.startsWith("db/migrations/"))
    .map((file) => path.basename(file));

  const errors = [...checkVersion(), ...checkJson(jsonFiles), ...checkMigrationOrder(migrations)];

  if (errors.length > 0) {
    console.error("계약 파일이 규칙을 위반한다.\n");
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exit(1);
  }

  console.log(`JSON ${jsonFiles.length}개와 migration ${migrations.length}개를 읽었다`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
