import {
    enforcementLevel,
    listAgentFiles,
    listAxisSurfaces,
    listCases,
    normalizePathTemplate,
    readAgentApiRoutes,
    readAgentCases,
    readAgentMeta,
    readAgentOutput,
    readAgentPrompt,
    readAgentTools,
    readCase,
    readDeclaredHttpPaths,
    readAxisLabelNames,
    readJobLedgerAxisColumn,
    readJson,
    readText,
    readToolBindingPaths,
    readOpenApiEnum,
    readVersion,
    readWorkerSdkMetrics,
    routeKey,
} from "./contract.mjs";

const SURFACE_PATH = "/internal/surface";

/** 도는 서버가 자기 라우팅 표를 그대로 내므로 그것을 계약이 선언한 창구와 대조한다. */
async function readServedRoutes(baseUrl) {
    const response = await fetch(new URL(SURFACE_PATH, baseUrl));
    if (!response.ok) {
        throw new Error(`${baseUrl} 가 자기 표면을 내지 않는다 — ${SURFACE_PATH} 가 ${response.status} 다`);
    }
    const body = await response.json();
    return new Set(body.data.routes.map(routeKey));
}

const AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"];
const SHARED = [
    "languages.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
];
const WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"];
const TOPIC_FIELDS = ["name", "key", "payload", "delivery"];
const STREAM_KEYS = [
    "meaning",
    "method",
    "path",
    "contentType",
    "event",
    "frame",
    "frameFields",
    "replay",
    "reconnect",
    "draftReset",
    "resendIntervalMs",
    "headers",
];
const STREAM_NESTED = {
    replay: ["mode", "lastEventId", "reason"],
    reconnect: ["initialBackoffMs", "maxBackoffMs", "resetOn", "stopOn"],
    headers: ["Cache-Control", "Connection", "X-Accel-Buffering"],
};
const STREAM_PLACES = STREAM_KEYS.length + Object.values(STREAM_NESTED).flat().length;
const AXIS_VALUES = ["ts", "python"];
const NON_AXIS_WORDS = ["claude-sdk", "typescript"];
const AXIS_DURATION_UNIT = "seconds";
// 지표 창구는 수집기를 지나지 않으므로 Prometheus 의 고전 라벨 이름 규칙을 그대로 받는다.
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_SUFFIXES = ["countersTotalSuffix", "unitSuffix"];

const version = readVersion();
const cases = listCases();
const surfaces = [];

for (const name of cases) {
    readCase(name);
    surfaces.push(`conformance/cases/${name}.json`);
}

const AGENT_READERS = {
    "agent.json": readAgentMeta,
    "prompt.json": readAgentPrompt,
    "tool.json": readAgentTools,
    "output.json": readAgentOutput,
    "cases.json": readAgentCases,
};

let agentFileCount = 0;
for (const agent of AGENTS) {
    for (const file of listAgentFiles(agent)) {
        AGENT_READERS[file](agent);
        surfaces.push(`agent/${agent}/${file}`);
        agentFileCount += 1;
    }
}
for (const file of SHARED) surfaces.push(`agent/shared/${file}`);
for (const file of WIRE) surfaces.push(`wire/${file}`);
surfaces.push(
    "workflow/queues.yaml",
    "workflow/metrics.yaml",
    "http/agent-api.openapi.yaml",
    "http/tracer-dependency.openapi.yaml",
);

const grouped = { enforced: [], recorded: [], unclassified: [] };
for (const surface of surfaces) grouped[enforcementLevel(surface)].push(surface);

const declaredPaths = new Set(readDeclaredHttpPaths());
const bindings = readToolBindingPaths();
const unmet = bindings.filter((binding) => !declaredPaths.has(normalizePathTemplate(binding.path)));

const intakeKinds = readCase("job.intake").kinds;
const ledgerKinds = Object.keys(readJson("wire/job.kinds.json").kinds);
const kindMismatch = [
    ["OpenAPI 의 JobKind", readOpenApiEnum("JobKind")],
    ["wire/job.kinds.json", ledgerKinds],
].filter(([, values]) => [...values].sort().join() !== [...intakeKinds].sort().join());

const stream = readCase("chat.query").stream ?? {};
const missingStream = [
    ...STREAM_KEYS.filter((key) => stream[key] === undefined).map((key) => `stream.${key}`),
    ...Object.entries(STREAM_NESTED).flatMap(([group, keys]) =>
        keys.filter((key) => stream[group]?.[key] === undefined).map((key) => `stream.${group}.${key}`),
    ),
];

const axis = readOpenApiEnum("AgentAxis");
const axisSurfaces = listAxisSurfaces();
const strayAxisNames = axisSurfaces.flatMap((surface) => {
    const declared = readText(surface).toLowerCase();
    return NON_AXIS_WORDS.filter((word) => declared.includes(word)).map((word) => `${surface} 의 ${word}`);
});
const axisColumn = readJobLedgerAxisColumn();
const workerMetrics = readWorkerSdkMetrics();
const axisLabel = readAxisLabelNames();

const topics = readJson("wire/topics.json");
const incompleteTopics = Object.entries(topics)
    .filter(([, topic]) => TOPIC_FIELDS.some((field) => topic[field] === undefined))
    .map(([id]) => id);

if (cases.length === 0) throw new Error("적합성 케이스가 하나도 없다");
if (grouped.unclassified.length > 0) {
    throw new Error(`강제인지 기록인지 정해지지 않은 자리가 있다 — ${grouped.unclassified.join(", ")}`);
}
if (unmet.length > 0) {
    const detail = unmet.map((binding) => `${binding.name} ${binding.path}`).join(", ");
    throw new Error(`도구가 부르는 경로를 어느 HTTP 표면도 선언하지 않는다 — ${detail}`);
}
if (kindMismatch.length > 0) {
    throw new Error(
        `접수가 받는 잡 종류가 자리마다 다르다 — job.intake 는 ${intakeKinds.join(", ")} 인데 ` +
            kindMismatch.map(([where, values]) => `${where} 는 ${values.join(", ")}`).join(" · "),
    );
}
if (incompleteTopics.length > 0) {
    throw new Error(
        `토픽 선언에 ${TOPIC_FIELDS.join(" · ")} 가 다 있어야 한다 — ${incompleteTopics.join(", ")}`,
    );
}
if (missingStream.length > 0) {
    throw new Error(`실행 스트림 절에 있어야 할 자리가 없다 — ${missingStream.join(", ")}`);
}
if (axis.join() !== AXIS_VALUES.join()) {
    throw new Error(`축의 이름은 ${AXIS_VALUES.join(", ")} 둘이다 — AgentAxis 는 ${axis.join(", ")} 다`);
}
if (strayAxisNames.length > 0) {
    throw new Error(`축의 이름이 될 수 없는 낱말이 계약에 있다 — ${strayAxisNames.join(", ")}`);
}
if (axisColumn === null) {
    throw new Error("migration 이 잡 원장에 축의 칸을 더하지 않는다 — ai_jobs 에 backend 가 없다");
}
if (!axisColumn.includes("NOT NULL")) {
    throw new Error(`잡 원장의 축은 비어 있을 수 없다 — ${axisColumn}`);
}
if (workerMetrics.port === null || workerMetrics.durationUnit !== AXIS_DURATION_UNIT) {
    throw new Error(
        `워커 지표 창구는 포트와 ${AXIS_DURATION_UNIT} 단위를 함께 적어야 한다 — ` +
            `포트 ${workerMetrics.port ?? "없음"}, 단위 ${workerMetrics.durationUnit ?? "없음"}`,
    );
}
if (NAME_SUFFIXES.some((name) => workerMetrics[name] === null)) {
    throw new Error(
        `지표의 이름을 빚는 값은 기본에 기대지 않고 계약이 적는다 — ${NAME_SUFFIXES.join(" · ")}`,
    );
}
if (axisLabel.attributeKey === null || axisLabel.labelName === null) {
    throw new Error("축의 라벨은 계측이 쓰는 속성 이름과 창구가 싣는 라벨 이름을 함께 적어야 한다");
}
if (!LABEL_NAME.test(axisLabel.labelName)) {
    throw new Error(
        `지표 창구가 싣는 라벨 이름은 Prometheus 가 그대로 읽을 수 있어야 한다 — ${axisLabel.labelName}`,
    );
}
if (axisLabel.attributeKey.replaceAll(".", "_") !== axisLabel.labelName) {
    throw new Error(
        `수집기가 점을 밑줄로 바꾼 이름이 라벨 이름과 같아야 한다 — ` +
            `${axisLabel.attributeKey} 와 ${axisLabel.labelName}`,
    );
}

const declaredRoutes = readAgentApiRoutes();
const recordedUnserved = readCase("divergence").items.flatMap((item) => item.unservedPaths ?? []);
const baseUrl = process.argv[2];
if (baseUrl !== undefined) {
    const served = await readServedRoutes(baseUrl);
    const unserved = declaredRoutes.filter(
        (route) => !served.has(routeKey(route))
            && !recordedUnserved.some((prefix) => route.path.startsWith(prefix)),
    );
    if (unserved.length > 0) {
        throw new Error(
            `계약이 선언한 창구에 서버가 없다 — ${unserved.map(routeKey).join(", ")}`,
        );
    }
    console.log(
        `${baseUrl} 가 계약의 창구 ${declaredRoutes.length}자리를 연다 — ` +
            `갈라짐으로 적힌 ${recordedUnserved.join(", ") || "없음"} 은 묻지 않는다`,
    );
}

console.log(`계약 ${version}: 케이스 ${cases.length}개를 읽었다 — ${cases.join(", ")}`);
console.log(`에이전트 ${AGENTS.length}개의 계약 파일 ${agentFileCount}개를 읽었다`);
console.log(`강제 ${grouped.enforced.length}자리, 기록 ${grouped.recorded.length}자리`);
console.log(`도구 ${bindings.length}개가 부르는 경로를 HTTP 표면 ${declaredPaths.size}자리가 덮는다`);
console.log(`접수가 받는 잡 종류 ${intakeKinds.length}개를 세 자리가 같게 적는다 — ${intakeKinds.join(", ")}`);
console.log(
    `서비스를 넘는 토픽 ${Object.keys(topics).length}개를 선언한다 — ` +
        `${Object.values(topics).map((topic) => topic.name).join(", ")}`,
);
console.log(`실행 스트림 절의 자리 ${STREAM_PLACES}개를 대조한다`);
console.log(`축의 이름 ${axis.length}개를 계약이 한 벌로 갖는다 — ${axis.join(", ")}`);
console.log(`축의 이름을 담을 수 있는 자리 ${axisSurfaces.length}개가 그 둘만 쓴다`);
console.log(`잡 원장이 축의 칸을 갖는다 — ${axisColumn}`);
console.log(
    `워커 SDK 지표 창구는 포트 ${workerMetrics.port} 를 열고 ${workerMetrics.durationUnit} 단위로 낸다`,
);
console.log(
    `축의 라벨은 계측에서 ${axisLabel.attributeKey} 이고 창구에서 ${axisLabel.labelName} 이다`,
);
console.log(
    `지표의 이름을 빚는 값 ${NAME_SUFFIXES.length}개를 계약이 적는다 — ` +
        NAME_SUFFIXES.map((name) => `${name} ${workerMetrics[name]}`).join(", "),
);
