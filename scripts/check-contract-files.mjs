#!/usr/bin/env node
// 적합성 검사기가 읽지 않는 계약 파일까지 문법과 이름 규칙을 검사한다.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MIGRATION_PATTERN = /^(\d{4})-[a-z0-9-]+\.sql$/;
const CONTRACT_VERSION_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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
      errors.push(`migration 이름이 NNNN-소문자-이름.sql 이 아니다: ${name}`);
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

function checkJson(files) {
  const errors = [];
  for (const file of files) {
    try {
      const document = JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
      if (file.startsWith("agent/")) errors.push(...checkContractVersions(file, document));
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
