import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CASES = join(ROOT, "conformance", "cases");
const SUFFIX = ".json";
const HTTP_SURFACES = ["agent-api.openapi.yaml", "tracer-dependency.openapi.yaml"];
const AGENT_FILES = ["agent.json", "prompt.json", "tool.json", "output.json", "cases.json"];
const AXIS_SURFACE_ROOTS = ["agent", "conformance/cases", "db", "http", "wire", "workflow"];
const AXIS_SURFACE_SUFFIXES = [".json", ".yaml", ".md", ".sql"];
const JOB_AXIS_COLUMN_PATTERN = /ALTER TABLE "ai_jobs" ADD COLUMN[^;]*"backend"[^;]*;/;

/** 계약 뿌리의 절대 경로이며 스위트를 붙인 구현체는 이 아래만 읽는다. */
export function contractRoot() {
    return ROOT;
}

/** 이 계약의 판이며 구현체는 자기가 고정한 판과 대조한다. */
export function readVersion() {
    return readFileSync(join(ROOT, "VERSION"), "utf8").trim();
}

/** 계약 뿌리를 기준으로 한 상대 경로의 파일 하나를 글자 그대로 읽는다. */
export function readText(relative) {
    return readFileSync(join(ROOT, relative), "utf8");
}

/** 계약 뿌리를 기준으로 한 상대 경로의 JSON 파일 하나를 읽는다. */
export function readJson(relative) {
    return JSON.parse(readText(relative));
}

/** 축의 이름을 담을 수 있는 계약 파일을 뿌리 기준 상대 경로로 사전순으로 낸다. */
export function listAxisSurfaces() {
    const found = AXIS_SURFACE_ROOTS.flatMap((root) => walk(root));
    return found.filter((path) => AXIS_SURFACE_SUFFIXES.some((suffix) => path.endsWith(suffix))).sort();
}

function walk(relative) {
    return readdirSync(join(ROOT, relative), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(`${relative}/${entry.name}`) : [`${relative}/${entry.name}`],
    );
}

/** 잡 원장에 축의 칸을 더하는 선언을 낸다. */
export function readJobLedgerAxisColumn() {
    for (const name of listMigrations()) {
        const declared = JOB_AXIS_COLUMN_PATTERN.exec(readText(`db/migrations/${name}`));
        if (declared !== null) return declared[0];
    }
    return null;
}

/** migration 파일의 이름을 번호 순서로 낸다. */
export function listMigrations() {
    return readdirSync(join(ROOT, "db", "migrations")).filter((name) => name.endsWith(".sql")).sort();
}

/** 워커가 여는 SDK 지표 창구의 포트와 시간 단위를 낸다. */
export function readWorkerSdkMetrics() {
    const declared = readText("workflow/metrics.yaml");
    const port = /^ {2}port: (\d+)$/m.exec(declared);
    const unit = /^ {2}durationUnit: (\S+)$/m.exec(declared);
    return {
        port: port === null ? null : Number(port[1]),
        durationUnit: unit === null ? null : unit[1],
        ...readNameSuffixes(declared),
    };
}

/** 지표의 이름을 빚는 접미사 둘을 낸다. 선언하지 않았으면 null 이다. */
function readNameSuffixes(declared) {
    return Object.fromEntries(
        ["countersTotalSuffix", "unitSuffix"].map((name) => {
            const found = new RegExp(`^ {2}${name}: (true|false)$`, "m").exec(declared);
            return [name, found === null ? null : found[1] === "true"];
        }),
    );
}

/** 축을 싣는 두 이름을 낸다. 계측이 쓰는 속성 이름과 지표 창구가 싣는 라벨 이름이다. */
export function readAxisLabelNames() {
    const declared = readText("workflow/metrics.yaml");
    const attribute = /^ {4}attributeKey: (\S+)$/m.exec(declared);
    const label = /^ {4}labelName: (\S+)$/m.exec(declared);
    return {
        attributeKey: attribute === null ? null : attribute[1],
        labelName: label === null ? null : label[1],
    };
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

/** 에이전트 하나가 갖는 계약 파일의 이름을 정해진 순서로 낸다. */
export function listAgentFiles(agentId) {
    const present = new Set(readdirSync(join(ROOT, "agent", agentId)));
    return AGENT_FILES.filter((file) => present.has(file));
}

/** 에이전트의 정체를 읽는다. */
export function readAgentMeta(agentId) {
    return readAgentFile(agentId, "agent.json");
}

/** 에이전트의 프롬프트 조각과 템플릿을 읽는다. */
export function readAgentPrompt(agentId) {
    return readAgentFile(agentId, "prompt.json");
}

/** 에이전트의 도구와 인자와 상한을 읽는다. */
export function readAgentTools(agentId) {
    return readAgentFile(agentId, "tool.json");
}

/** 에이전트의 구조화 출력 스키마를 읽는다. */
export function readAgentOutput(agentId) {
    return readAgentFile(agentId, "output.json");
}

/** 에이전트의 판정 케이스를 읽는다. */
export function readAgentCases(agentId) {
    return readAgentFile(agentId, "cases.json");
}

function readAgentFile(agentId, fileName) {
    return readJson(join("agent", agentId, fileName));
}

/** 네 에이전트가 함께 쓰는 계약 파일 하나를 읽는다. */
export function readShared(fileName) {
    return readJson(join("agent", "shared", fileName));
}

/** 경로 변수의 이름은 선언하는 쪽의 사정이므로 표면을 대조할 때는 변수 자리만 남긴다. */
export function normalizePathTemplate(path) {
    return path.replace(/\{[^}]*\}/g, "{}");
}

/** 에이전트가 추적 API에 요구하는 경로를 사전순으로 낸다. */
export function readDependencyPaths() {
    return readSurfacePaths("tracer-dependency.openapi.yaml").sort();
}

/** 계약이 선언한 HTTP 경로 전부를 변수 이름을 지운 꼴로 사전순으로 낸다. */
export function readDeclaredHttpPaths() {
    const declared = HTTP_SURFACES.flatMap(readSurfacePaths).map(normalizePathTemplate);
    return [...new Set(declared)].sort();
}

function readSurfacePaths(fileName) {
    const spec = readFileSync(join(ROOT, "http", fileName), "utf8");
    return [...spec.matchAll(/^ {2}(\/\S+):$/gm)].map((match) => match[1]);
}

/** 에이전트 서비스가 열어야 하는 창구를 메서드와 경로의 쌍으로 사전순으로 낸다. */
export function readAgentApiRoutes() {
    const spec = readFileSync(join(ROOT, "http", "agent-api.openapi.yaml"), "utf8");
    const routes = [];
    let path = null;
    for (const line of spec.split("\n")) {
        const declared = /^ {2}(\/\S+):$/.exec(line);
        if (declared) {
            path = declared[1];
            continue;
        }
        if (path === null) continue;
        const method = /^ {4}(get|post|put|patch|delete):$/.exec(line);
        if (method) routes.push({ method: method[1].toUpperCase(), path: normalizePathTemplate(path) });
        else if (/^ {0,3}\S/.test(line)) path = null;
    }
    return routes.sort((left, right) => (routeKey(left) < routeKey(right) ? -1 : 1));
}

/** OpenAPI 가 선언한 이름 붙은 enum 하나의 값을 낸다. */
export function readOpenApiEnum(schemaName) {
    const spec = readFileSync(join(ROOT, "http", "agent-api.openapi.yaml"), "utf8");
    const declared = new RegExp(`^ {4}${schemaName}:\\n(?: {6}.*\\n)*? {6}enum: \\[([^\\]]*)\\]`, "m").exec(spec);
    if (declared === null) throw new Error(`${schemaName} 이 enum 을 선언하지 않는다`);
    return declared[1].split(",").map((value) => value.trim());
}

/** 메서드와 경로를 한 문자열로 모아 대조와 정렬의 키로 쓴다. */
export function routeKey(route) {
    return `${route.method} ${normalizePathTemplate(route.path)}`;
}

/** 대화 도구가 어느 경로의 뷰인지를 도구 이름 순으로 낸다. */
export function readToolBindingPaths() {
    const { bindings } = readAgentTools("chat").bindings;
    return Object.entries(bindings)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([name, binding]) => ({ name, method: binding.method, path: binding.path }));
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
