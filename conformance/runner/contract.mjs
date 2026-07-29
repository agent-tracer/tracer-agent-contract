import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CASES = join(ROOT, "conformance", "cases");
const SUFFIX = ".json";

/** 계약 뿌리의 절대 경로이며 스위트를 붙인 구현체는 이 아래만 읽는다. */
export function contractRoot() {
    return ROOT;
}

/** 이 계약의 판이며 구현체는 자기가 고정한 판과 대조한다. */
export function readVersion() {
    return readFileSync(join(ROOT, "VERSION"), "utf8").trim();
}

/** 계약 뿌리를 기준으로 한 상대 경로의 JSON 파일 하나를 읽는다. */
export function readJson(relative) {
    return JSON.parse(readFileSync(join(ROOT, relative), "utf8"));
}

/** 적합성 케이스의 이름을 사전순으로 낸다. */
export function listCases() {
    return readdirSync(CASES)
        .filter((entry) => entry.endsWith(SUFFIX))
        .map((entry) => entry.slice(0, -SUFFIX.length))
        .sort();
}

/** 이름으로 적합성 케이스 하나를 읽는다. */
export function readCase(name) {
    return JSON.parse(readFileSync(join(CASES, `${name}${SUFFIX}`), "utf8"));
}

/** 에이전트 하나의 명세를 읽는다. */
export function readAgentSpec(agentId) {
    return readJson(join("agent", agentId, "spec.json"));
}

/** 네 에이전트가 함께 쓰는 계약 파일 하나를 읽는다. */
export function readShared(fileName) {
    return readJson(join("agent", "shared", fileName));
}

/** 계약의 어느 자리가 강제이고 어느 자리가 기록인지를 읽는다. */
export function readEnforcement() {
    return readJson(join("conformance", "enforcement.json"));
}

/**
 * 계약의 자리 하나가 강제인지 기록인지를 낸다.
 * 자리는 "wire/envelope.json"이나 "agent/chat/spec.json#tools"처럼 적으며
 * 어느 목록에도 닿지 않으면 "unclassified"를 낸다.
 */
export function enforcementLevel(path) {
    const { levels } = readEnforcement();
    for (const level of ["enforced", "recorded"]) {
        if (levels[level].paths.some((prefix) => path === prefix || path.startsWith(prefix))) return level;
    }
    return "unclassified";
}
