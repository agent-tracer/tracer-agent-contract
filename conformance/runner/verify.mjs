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
    readIdentifierRules,
    readRunObservationRules,
    readDeclaredHttpPaths,
    readAxisLabelNames,
    readChatLedgerAxisIndex,
    readChatThreadQueue,
    readJobLedgerAxisColumn,
    readJson,
    readLedgerTables,
    readMcpToolNames,
    readSearchIndex,
    readSearchOutboxTarget,
    readTableColumns,
    readText,
    readToolBindingPaths,
    readToolSurfaces,
    readOpenApiEnum,
    readRedaction,
    readScopeToken,
    readShared,
    readSettlement,
    readTraceAttributeNames,
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

const AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup"];
const SHARED = [
    "languages.json",
    "settings.execution.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "execution.budget.json",
    "execution.limits.json",
    "model.envelope.json",
    "model.rates.json",
    "redaction.json",
    "scope.token.json",
    "text.limits.json",
    "dispatch.plan.json",
    "ledger.availability.json",
];
const WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json", "search.index.json"];
// 레시피와 정리 제안의 원장이 에이전트 원장이므로 이 표들이 없으면 그 창구가 설 자리가 없다.
const LEDGER_TABLES = ["recipes", "recipe_applications", "task_cleanup_suggestions", "search_outbox"];
// 얇은 적중의 이 두 칸은 문서의 칸이 아니라 문서의 식별자와 색인이 매긴 점수에서 온다.
const HIT_FIELDS_OUTSIDE_DOCUMENT = ["recipeId", "score"];
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// 에이전트 상류가 없으면 등록되지 않아야 하는 MCP 도구이며 넷 다 에이전트 표면을 부른다.
const MCP_AGENT_TOOLS = ["get_recipe", "report_recipe_outcome", "request_recipe_scan", "search_recipes"];
// 적용 이력 행이 사건에서 오므로 그 사건이 실어야 하는 칸이 없으면 행을 만들 수 없다.
const PROJECTION_GUARDS = ["missingFields", "alreadyOpen", "redelivery"];

/**
 * 조건보다 뒤에 도착한 사건만 새 활동이다. 같은 시각은 새 활동이 아니다.
 * 시각의 표기가 한 벌이므로 글자 비교가 곧 시각 비교다.
 */
function hasActivitySince(lastEventAt, observedAt) {
    if (typeof lastEventAt !== "string" || !INSTANT_PATTERN.test(lastEventAt)) return false;
    if (typeof observedAt !== "string" || !INSTANT_PATTERN.test(observedAt)) return true;
    return lastEventAt > observedAt;
}
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
    "draft",
    "resendIntervalMs",
    "headers",
];
const STREAM_NESTED = {
    replay: ["mode", "lastEventId", "reason"],
    reconnect: ["initialBackoffMs", "maxBackoffMs", "resetOn", "resetOnReason", "stopOn"],
    draft: ["intervalMs", "edge", "meaning", "firstChunk", "coalesce", "seqUnit", "nonBlocking"],
    headers: ["Cache-Control", "Connection", "X-Accel-Buffering"],
};
const STREAM_PLACES = STREAM_KEYS.length + Object.values(STREAM_NESTED).flat().length;
const AXIS_VALUES = ["ts", "python"];
const THREAD_SIGNAL_ARGS = ["executionId"];
const THREAD_ACTIVITIES = ["getNextChatExecution"];
const TOOL_SURFACES = ["read", "agentRead", "memory", "confirm"];
const CONFIRM_SURFACE = "confirm";
// 프롬프트가 확인 도구 하나를 즉시 실행이라고 적으면 모델이 서지 않은 쓰기를 섰다고 답한다.
const IMMEDIATE_PHRASES = ["runs immediately", "run immediately", "runs right away", "without confirmation"];

/** 확인을 받아야 하는 도구를 즉시 실행이라고 적은 프롬프트 문장을 찾는다. */
function confirmToolsCalledImmediate(agentId, confirmTools) {
    const { fragments } = readAgentPrompt(agentId);
    const lines = Object.values(fragments)
        .map((fragment) => (Array.isArray(fragment.content) ? fragment.content.join(" ") : ""))
        .filter(Boolean);
    const found = [];
    for (const sentence of lines.join(" ").split(/(?<=[.:])\s+/u)) {
        const lowered = sentence.toLowerCase();
        if (!IMMEDIATE_PHRASES.some((phrase) => lowered.includes(phrase))) continue;
        for (const name of confirmTools) {
            if (sentence.includes(name)) found.push(`${name}: ${sentence.trim()}`);
        }
    }
    return found;
}
const PROVIDER_REQUEST_RULES = ["unit", "source", "absent", "notSession", "manyCalls"];
const TTFT_RULES = ["unit", "source", "absent", "notDuration", "noEstimate"];
const NON_AXIS_WORDS = ["claude-sdk", "typescript"];
const AXIS_DURATION_UNIT = "seconds";
// 지표 창구는 수집기를 지나지 않으므로 Prometheus 의 고전 라벨 이름 규칙을 그대로 받는다.
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NAME_SUFFIXES = ["countersTotalSuffix", "unitSuffix"];
const REDACTION_PLACES = ["marker", "matching", "keys", "values", "onSuspect", "stages"];
const REDACTION_STAGES = ["trace", "query", "output"];
const VALUE_BODY_PLACES = ["minLength", "charset", "skipSpaceBetween"];
const SUSPECT_SPAN_PLACES = ["byKey", "byValue", "spanBounds"];
const ON_SUSPECT_ACTIONS = ["redact", "discard"];
// 실행에 실험의 자리가 없으므로 이 이름은 어느 속성으로도 나가지 않는다.
const RETIRED_ATTRIBUTES = [
    "agent_tracer.experiment.id",
    "agent_tracer.example.id",
    "agent_tracer.variant.id",
];


/** 칸 이름과 그 수 사이에 이만큼 안에서 만나야 그 수가 그 칸을 말한 것으로 본다. */
const LIMIT_PROXIMITY = 160;

/** 스키마가 상한을 건 자리마다 그 상한이 걸린 칸의 이름과 수를 낸다. */
function schemaLimitSites(agentId) {
    const sites = new Map();
    const walk = (node, field) => {
        if (node === null || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach((item) => walk(item, field));
        for (const keyword of ["maxLength", "maxItems"]) {
            const value = node[keyword];
            if (typeof value === "number" && value > 1 && field !== null) {
                sites.set(`${field}:${value}`, { field, value });
            }
        }
        for (const [key, nested] of Object.entries(node)) {
            if ((key === "properties" || key === "$defs") && nested !== null && typeof nested === "object") {
                for (const [name, child] of Object.entries(nested)) walk(child, name);
                continue;
            }
            walk(nested, field);
        }
    };
    walk(readAgentOutput(agentId).schema, null);
    return [...sites.values()];
}

/** 모델이 실제로 읽는 프롬프트 본문이며 실행이 채우는 자리표시자를 계약의 값으로 채워 둔다. */
function promptBody(agentId) {
    const lines = [];
    for (const fragment of Object.values(readAgentPrompt(agentId).fragments)) {
        if (Array.isArray(fragment.content)) lines.push(...fragment.content);
        for (const variant of Object.values(fragment.byLanguage ?? {})) lines.push(...variant);
    }
    let body = lines.join("\n");
    for (const [name, value] of Object.entries(readAgentTools(agentId).limits ?? {})) {
        body = body.replaceAll(`\${${name}}`, String(value));
    }
    return body;
}

/**
 * 모델이 지켜야 하는 상한은 스키마에만 두면 모델에게 닿지 않으므로 프롬프트 본문에도 있어야 한다.
 * 수만 세면 같은 수를 쓰는 다른 칸이 서로를 통과시키므로 칸의 이름 곁에서 그 수를 찾는다.
 */
function schemaLimitsMissingFromPrompt(agentId) {
    const body = promptBody(agentId);
    return schemaLimitSites(agentId)
        .filter(({ field, value }) => !statesLimit(body, field, value))
        .map(({ field, value }) => `${field} 의 ${value}`);
}

/** 칸의 이름과 그 수가 서로 이 거리 안에 있으면 그 수가 그 칸을 말한 것으로 본다. 문장은 두 순서로 모두 쓰인다. */
function statesLimit(body, field, value) {
    const name = field.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const gap = `[\\s\\S]{0,${LIMIT_PROXIMITY}}?`;
    const after = new RegExp(`\\b${name}\\b${gap}\\b${value}\\b`, "u");
    const before = new RegExp(`\\b${value}\\b${gap}\\b${name}\\b`, "u");
    return after.test(body) || before.test(body);
}

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
    "summary.json": (agent) => readJson(`agent/${agent}/summary.json`),
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
    "workflow/trace.attributes.yaml",
    "http/agent-api.openapi.yaml",
    "http/tracer-dependency.openapi.yaml",
);

const grouped = { enforced: [], recorded: [], unclassified: [] };
for (const surface of surfaces) grouped[enforcementLevel(surface)].push(surface);

// 목록을 손으로 적는 자리이므로 계약에 파일을 더하고 목록에 적지 않으면 그 자리는 조용히 검사 밖에 선다.
const countedSurfaces = new Set(surfaces);
const unlistedAgentFiles = listAxisSurfaces()
    .filter((path) => path.startsWith("agent/") && path.endsWith(".json"))
    .filter((path) => !countedSurfaces.has(path));

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
const chatAxisIndex = readChatLedgerAxisIndex();
const threadQueue = readChatThreadQueue();
const toolSurfaces = readToolSurfaces();
const declaredSurfaces = readCase("chat.tools").tools;
const workerMetrics = readWorkerSdkMetrics();
const axisLabel = readAxisLabelNames();

const redaction = readRedaction();
const missingRedaction = REDACTION_PLACES.filter((place) => redaction[place] === undefined);
const redactionWords = {
    keys: redaction.keys?.words ?? [],
    values: redaction.values?.words ?? [],
};
const emptyRedactionWords = Object.entries(redactionWords)
    .filter(([, words]) => words.length === 0)
    .map(([name]) => name);
// 값 쪽 낱말은 사람이 쓴 본문에도 나오므로 몸통을 요구하는 자리가 없으면 답이 통째로 가려진다.
// 걸린 자리가 어디까지인지 정하지 않으면 한 축은 본문을 통째로 바꾸고 다른 축은 구간만 바꾼다.
const missingSuspectSpan = SUSPECT_SPAN_PLACES.filter(
    (place) => redaction.onSuspect?.suspectSpan?.[place] === undefined,
);
const missingTrailingBody = VALUE_BODY_PLACES.filter(
    (place) => redaction.values?.requiresTrailingBody?.[place] === undefined,
);
const stages = redaction.stages ?? {};
const missingStages = REDACTION_STAGES.filter((name) => stages[name] === undefined);
const strayOnSuspect = REDACTION_STAGES.filter(
    (name) => stages[name] !== undefined && !ON_SUSPECT_ACTIONS.includes(stages[name].onSuspect),
).map((name) => `${name} ${stages[name].onSuspect ?? "없음"}`);
const traceAttributes = readTraceAttributeNames();
const traceAttributeText = readText("workflow/trace.attributes.yaml");
const retiredAttributes = RETIRED_ATTRIBUTES.filter((name) => traceAttributeText.includes(name));

const topics = readJson("wire/topics.json");
const incompleteTopics = Object.entries(topics)
    .filter(([, topic]) => TOPIC_FIELDS.some((field) => topic[field] === undefined))
    .map(([id]) => id);

if (cases.length === 0) throw new Error("적합성 케이스가 하나도 없다");
if (unlistedAgentFiles.length > 0) {
    throw new Error(
        `계약에 있으나 검사기가 세지 않는 자리가 있다 — ${unlistedAgentFiles.join(", ")}`,
    );
}
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
const strayToolSurfaces = Object.keys(toolSurfaces).filter((name) => !TOOL_SURFACES.includes(name));
if (strayToolSurfaces.length > 0) {
    throw new Error(
        `도구가 열리는 표면은 ${TOOL_SURFACES.join(", ")} 넷이다 — ${strayToolSurfaces.join(", ")} 는 그중에 없다`,
    );
}
const surfaceMismatch = TOOL_SURFACES.filter(
    (name) => (toolSurfaces[name] ?? []).join() !== (declaredSurfaces[name] ?? []).join(),
);
if (surfaceMismatch.length > 0) {
    throw new Error(
        `도구의 표면과 적합성이 적은 목록이 다르다 — ` +
            surfaceMismatch
                .map((name) => `${name} 은 ${(toolSurfaces[name] ?? []).join(", ") || "없음"} 인데 케이스는 ${(declaredSurfaces[name] ?? []).join(", ") || "없음"} 다`)
                .join(" · "),
    );
}
// action 마다 필요한 인자가 다르므로 그 표가 없거나 action 하나를 빠뜨리면 그 갈래는 아무것도 요구하지 않게 된다.
const chatTools = readAgentTools("chat").tools;
const brokenRequiredByAction = Object.entries(chatTools).flatMap(([name, tool]) => {
    if (tool.surface !== CONFIRM_SURFACE || tool.args?.action === undefined) return [];
    const declared = tool.requiredByAction;
    if (declared === undefined) return [`${name} 이 requiredByAction 을 갖지 않는다`];
    const values = tool.args.action.values ?? [];
    return [
        ...values.filter((value) => declared[value] === undefined).map((value) => `${name}.${value} 가 표에 없다`),
        ...Object.keys(declared).filter((key) => !values.includes(key)).map((key) => `${name}.${key} 는 action 이 아니다`),
        ...Object.entries(declared).flatMap(([action, names]) =>
            names.filter((argName) => tool.args[argName] === undefined).map((argName) => `${name}.${action} 이 없는 인자 ${argName} 을 요구한다`),
        ),
    ];
});
if (brokenRequiredByAction.length > 0) {
    throw new Error(`action 이 요구하는 인자의 표가 어긋난다 — ${brokenRequiredByAction.join(" · ")}`);
}
const promptlessLimits = AGENTS.flatMap((agent) =>
    schemaLimitsMissingFromPrompt(agent).map((site) => `${agent} 의 ${site}`),
);
if (promptlessLimits.length > 0) {
    throw new Error(`스키마가 요구하는 수치를 프롬프트가 모델에게 알리지 않는다 — ${promptlessLimits.join(" · ")}`);
}
const immediateConfirmTools = confirmToolsCalledImmediate("chat", toolSurfaces[CONFIRM_SURFACE] ?? []);
if (immediateConfirmTools.length > 0) {
    throw new Error(
        `프롬프트가 확인을 받아야 하는 도구를 즉시 실행이라고 적는다 — ${immediateConfirmTools.join(" · ")}`,
    );
}
if (chatAxisIndex === null) {
    throw new Error("migration 이 대화 실행 원장의 대기 줄을 축으로 가르지 않는다 — requested_backend 색인이 없다");
}
if ((threadQueue.signalArgs ?? []).join() !== THREAD_SIGNAL_ARGS.join()) {
    throw new Error(
        `스레드 시그널은 대기 줄이 움직였다는 포인터 하나만 나른다 — ` +
            `${THREAD_SIGNAL_ARGS.join(", ")} 여야 하는데 ${(threadQueue.signalArgs ?? ["없음"]).join(", ")} 다`,
    );
}
if (threadQueue.activities.join() !== THREAD_ACTIVITIES.join()) {
    throw new Error(
        `대기 줄의 주인이 원장이므로 스레드 워크플로가 그것을 읽는 창구를 계약이 적어야 한다 — ` +
            `${THREAD_ACTIVITIES.join(", ")} 여야 하는데 ${threadQueue.activities.join(", ") || "없음"} 다`,
    );
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
if (missingRedaction.length > 0) {
    throw new Error(`가리는 규칙에 있어야 할 자리가 없다 — ${missingRedaction.join(", ")}`);
}
if (typeof redaction.marker !== "string" || redaction.marker.length === 0) {
    throw new Error("가린 자리에 넣는 표시는 비어 있지 않은 문자열 하나다");
}
if (emptyRedactionWords.length > 0) {
    throw new Error(`가릴 낱말이 비어 있으면 규칙이 아무것도 가리지 못한다 — ${emptyRedactionWords.join(", ")}`);
}
if (missingSuspectSpan.length > 0) {
    throw new Error(
        `걸린 자리가 어디까지인지 정해야 두 축이 같게 가린다 — ${missingSuspectSpan.join(", ")} 가 없다`,
    );
}
if (missingTrailingBody.length > 0) {
    throw new Error(
        `값 쪽 낱말은 뒤에 이어질 몸통의 조건을 함께 적어야 한다 — ${missingTrailingBody.join(", ")} 가 없다`,
    );
}
if (missingStages.length > 0) {
    throw new Error(
        `가리는 자리 ${REDACTION_STAGES.join(" · ")} 가 다 있어야 한다 — ${missingStages.join(", ")} 가 없다`,
    );
}
if (strayOnSuspect.length > 0) {
    throw new Error(
        `자리마다 ${ON_SUSPECT_ACTIONS.join(" 이나 ")} 를 하나 골라야 한다 — ${strayOnSuspect.join(", ")}`,
    );
}
if (traceAttributes.length === 0) {
    throw new Error("추적이 나르는 속성을 계약이 하나도 선언하지 않는다");
}
if (retiredAttributes.length > 0) {
    throw new Error(`실행에 자리가 없는 이름이 추적 속성 표에 있다 — ${retiredAttributes.join(", ")}`);
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
console.log(`도구 ${TOOL_SURFACES.length} 표면이 열리는 도구를 나눈다 — ${TOOL_SURFACES.map((name) => `${name} ${toolSurfaces[name].length}`).join(" · ")}`);
console.log(`잡 원장이 축의 칸을 갖는다 — ${axisColumn}`);
console.log(`대화 실행의 대기 줄은 원장이 갖고 축으로 갈린다 — 시그널 ${threadQueue.signalArgs.join(", ")} · 액티비티 ${threadQueue.activities.join(", ")}`);
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
console.log(
    `가리는 규칙은 key 낱말 ${redactionWords.keys.length}개와 값의 모양 ${redactionWords.values.length}개를 ` +
        `${redaction.marker} 로 바꾼다`,
);
console.log(
    `가리는 자리 ${REDACTION_STAGES.length}개가 걸린 것을 어떻게 할지 적는다 — ` +
        REDACTION_STAGES.map((name) => `${name} ${stages[name].onSuspect}`).join(", "),
);
const settlement = readSettlement();
const identifierRules = readIdentifierRules();
const runObservationRules = readRunObservationRules();
const SETTLEMENT_PLACES = ["meaning", "fromQueued", "fromRunning", "appliesTo", "reason", "note"];
const missingSettlement = SETTLEMENT_PLACES.filter((place) => settlement[place] === undefined);
if (missingSettlement.length > 0) {
    throw new Error(`실행을 접는 조건에 있어야 할 자리가 없다 — ${missingSettlement.join(", ")}`);
}
const providerRequest = identifierRules.providerRequestId ?? {};
const missingProviderRequest = PROVIDER_REQUEST_RULES.filter((rule) => providerRequest[rule] === undefined);
if (missingProviderRequest.length > 0) {
    throw new Error(
        `공급자 요청 식별자의 값 규칙에 있어야 할 자리가 없다 — ${missingProviderRequest.join(", ")}`,
    );
}
const ttft = runObservationRules.ttftMs ?? {};
const missingTtft = TTFT_RULES.filter((rule) => ttft[rule] === undefined);
if (missingTtft.length > 0) {
    throw new Error(`첫 토큰까지의 시간에 관한 규칙에 있어야 할 자리가 없다 — ${missingTtft.join(", ")}`);
}
const pacing = readShared("execution.budget.json").pacing ?? {};
const PACING_PLACES = ["meaning", "unit", "progressNotice", "landingDirective"];
const TURN_LEDGER_PLACES = [
    "meaning",
    "totalIsWholeExecution",
    "lease",
    "settle",
    "settleWithoutReport",
    "settleFromUsage",
    "reservationReturn",
];
const PROGRESS_NOTICE_PLACES = ["template", "when", "placeholders", "reason"];
const LANDING_DIRECTIVE_PLACES = ["when", "structured", "freeText", "reason"];
const turnLedger = readShared("execution.budget.json").turnLedger ?? {};
const missingLedger = TURN_LEDGER_PLACES.filter((place) => turnLedger[place] === undefined);
if (missingLedger.length > 0) {
    console.error(`턴 원장에 있어야 할 자리가 없다 — ${missingLedger.join(", ")}`);
    process.exit(1);
}
const missingPacing = PACING_PLACES.filter((place) => pacing[place] === undefined);
if (missingPacing.length > 0) {
    throw new Error(`예산 페이싱에 있어야 할 자리가 없다 — ${missingPacing.join(", ")}`);
}
const missingNotice = PROGRESS_NOTICE_PLACES.filter(
    (place) => pacing.progressNotice[place] === undefined,
);
if (missingNotice.length > 0) {
    throw new Error(`남은 몫 통지에 있어야 할 자리가 없다 — ${missingNotice.join(", ")}`);
}
const missingLanding = LANDING_DIRECTIVE_PLACES.filter(
    (place) => pacing.landingDirective[place] === undefined,
);
if (missingLanding.length > 0) {
    throw new Error(`마무리 지시에 있어야 할 자리가 없다 — ${missingLanding.join(", ")}`);
}
const missingSlots = pacing.progressNotice.placeholders.filter(
    (slot) => !pacing.progressNotice.template.includes(`{${slot}}`),
);
if (missingSlots.length > 0) {
    throw new Error(`남은 몫 통지의 문구가 채울 자리를 갖지 않는다 — ${missingSlots.join(", ")}`);
}

const intakeCase = readCase("job.intake");
const credentialCheck = intakeCase.credentialCheck ?? {};
const CREDENTIAL_CHECK_PLACES = ["meaning", "appliesTo", "rejection", "reason", "notEnvelope"];
const missingCredentialCheck = CREDENTIAL_CHECK_PLACES.filter(
    (place) => credentialCheck[place] === undefined,
);
if (missingCredentialCheck.length > 0) {
    throw new Error(`접수의 자격 검사에 있어야 할 자리가 없다 — ${missingCredentialCheck.join(", ")}`);
}
if (!intakeCase.rejections.some((rejection) => rejection.code === credentialCheck.rejection)) {
    throw new Error(`접수의 자격 검사가 내는 ${credentialCheck.rejection} 를 거절 목록이 갖지 않는다`);
}
const jobResults = intakeCase.results;
const RESULT_PLACES = ["meaning", "byKind"];
const missingResultPlaces = RESULT_PLACES.filter((place) => jobResults?.[place] === undefined);
if (missingResultPlaces.length > 0) {
    throw new Error(`잡 산출 선언에 있어야 할 자리가 없다 — ${missingResultPlaces.join(", ")}`);
}
for (const [kind, declared] of Object.entries(jobResults.byKind)) {
    if (!intakeCase.kinds.includes(kind)) throw new Error(`산출을 적은 ${kind} 를 접수가 받지 않는다`);
    if (!(declared.required?.length > 0)) throw new Error(`${kind} 의 산출이 실어야 할 칸을 적지 않는다`);
    const fromOutput = declared.fromAgentOutput ?? [];
    const output = fromOutput.length === 0 ? {} : readAgentOutput(kind.replace(".", "-")).schema.properties ?? {};
    const stray = fromOutput.filter((field) => output[field] === undefined);
    if (stray.length > 0) {
        throw new Error(`${kind} 의 산출이 에이전트가 내지 않는 ${stray.join(", ")} 를 실으라고 적는다`);
    }
    const unrequired = fromOutput.filter((field) => !declared.required.includes(field));
    if (unrequired.length > 0) {
        throw new Error(`${kind} 의 산출이 ${unrequired.join(", ")} 를 실으면서 요구하지 않는다`);
    }
}
const scopeToken = readScopeToken();
const SCOPE_TOKEN_PLACES = ["meaning", "prefix", "prefixReason", "shape", "payload", "signature", "secret", "lifetime", "precedence"];
const missingScopeToken = SCOPE_TOKEN_PLACES.filter((place) => scopeToken[place] === undefined);
if (missingScopeToken.length > 0) {
    throw new Error(`실행 자격의 모양에 있어야 할 자리가 없다 — ${missingScopeToken.join(", ")}`);
}
const settingInputs = readShared("settings.execution.json").inputs;
const settingKeys = readOpenApiEnum("SettingKey");
for (const [field, declared] of Object.entries(settingInputs)) {
    if (!settingKeys.includes(declared.setting)) {
        throw new Error(`${field} 이 설정 표에 없는 ${declared.setting} 을 읽으라고 적는다`);
    }
    const strayKinds = declared.kinds.filter((kind) => !intakeKinds.includes(kind));
    if (strayKinds.length > 0) {
        throw new Error(`${field} 이 접수가 받지 않는 종류 ${strayKinds.join(", ")} 에 실린다고 적는다`);
    }
    const strayRequest = Object.keys(declared.requestField ?? {}).filter((kind) => !declared.kinds.includes(kind));
    if (strayRequest.length > 0) {
        throw new Error(`${field} 이 싣지 않는 종류 ${strayRequest.join(", ")} 의 요청 칸을 적는다`);
    }
}
const languageInput = settingInputs.language;
if (!readShared("languages.json").languages.includes(languageInput.default)) {
    throw new Error(`기본 출력 언어 ${languageInput.default} 가 언어 목록에 없다`);
}
const languageScope = readShared("languages.json").scope;
const unreadLanguage = Object.entries(readJson("wire/job.kinds.json").kinds)
    .filter(([kind, declared]) => languageScope[declared.agent] !== undefined && !languageInput.kinds.includes(kind))
    .map(([kind]) => kind);
if (unreadLanguage.length > 0) {
    throw new Error(`언어를 적용할 범위가 있는 종류가 설정을 읽지 않는다 — ${unreadLanguage.join(", ")}`);
}
const envelopeSettings = readShared("settings.execution.json").envelope;
const carriedEnvelope = Object.fromEntries(
    Object.entries(envelopeSettings).filter(([, declared]) => typeof declared === "object" && declared !== null),
);
for (const [field, declared] of Object.entries(carriedEnvelope)) {
    if (!settingKeys.includes(declared.setting)) {
        throw new Error(`봉투의 ${field} 이 설정 표에 없는 ${declared.setting} 을 읽으라고 적는다`);
    }
    if (declared.keeps.includes(declared.overrides)) {
        throw new Error(`봉투의 ${field} 이 ${declared.overrides} 를 덮으면서 그대로 둔다고도 적는다`);
    }
    const strayKinds = declared.kinds.filter((kind) => !intakeKinds.includes(kind));
    if (strayKinds.length > 0) {
        throw new Error(`봉투의 ${field} 이 접수가 받지 않는 종류 ${strayKinds.join(", ")} 에 실린다고 적는다`);
    }
}
console.log(`실행을 접는 조건 ${SETTLEMENT_PLACES.length}개를 계약이 갖는다`);
console.log(`공급자 요청 식별자의 값 규칙 ${PROVIDER_REQUEST_RULES.length}개를 계약이 갖는다`);
console.log(`첫 토큰까지의 시간에 관한 규칙 ${TTFT_RULES.length}개를 계약이 갖는다`);
console.log(`접수의 자격 검사에 관한 자리 ${CREDENTIAL_CHECK_PLACES.length}개를 계약이 갖는다`);
console.log(`잡 산출의 칸을 적은 종류 ${Object.keys(jobResults.byKind).length}개 — ${Object.keys(jobResults.byKind).join(", ")}`);
console.log(`예산 페이싱에 관한 자리 ${PACING_PLACES.length}개를 계약이 갖는다`);
console.log(`턴 원장의 정산 규칙 ${TURN_LEDGER_PLACES.length}개를 계약이 갖는다`);
console.log(
    `실행에 매인 자격은 ${scopeToken.prefix} 로 시작해 ${scopeToken.payload.fields.length}개 칸을 ` +
        `${scopeToken.signature.algorithm} 으로 서명한다`,
);
// 두 층이 같은 수를 쓰면 한쪽을 고칠 때 다른 쪽이 따라 움직이므로 자리가 나뉘어 있는지 본다.
const runnerRetry = readShared("execution.budget.json").runnerRetry;
for (const layer of ["transient", "schemaViolation"]) {
    if (!(runnerRetry[layer]?.attempts >= 0)) {
        throw new Error(`실행기 재시도의 ${layer} 층이 횟수를 적지 않는다`);
    }
}
if (runnerRetry.schemaViolation.directive.trim().length === 0) {
    throw new Error("규격을 어긴 산출을 되받는 지시가 비어 있다");
}

// 재생 상한이 요약 트리거보다 작으면 정상 흐름이 늘 상한에 닿아 신호가 되지 못한다.
const chatSummary = readJson("agent/chat/summary.json");
if (!(chatSummary.consumption.maxReplayMessages > chatSummary.production.trigger.messages)) {
    throw new Error(
        `재생 상한 ${chatSummary.consumption.maxReplayMessages} 가 요약 트리거 `
            + `${chatSummary.production.trigger.messages} 보다 넉넉하지 않다`,
    );
}

// 도구 인자의 상한은 스키마가 강제하지 못하므로 설명에 그 수가 있어야 모델에게 닿는다.
const silentArgLimits = AGENTS.flatMap((agent) =>
    Object.entries(readAgentTools(agent).tools ?? {}).flatMap(([tool, declared]) =>
        Object.entries(declared.args ?? {})
            .filter(([, arg]) => typeof arg?.maxLength === "number")
            .filter(([, arg]) => !String(arg.description ?? "").includes(String(arg.maxLength)))
            .map(([name]) => `${agent}.${tool}.${name}`)));
if (silentArgLimits.length > 0) {
    throw new Error(`도구 인자의 상한이 설명에 없어 모델에게 닿지 않는다 — ${silentArgLimits.join(", ")}`);
}

// 보고의 칸 목록은 두 축이 자기 모양을 대조하는 자리이므로 없어지면 그 대조가 조용히 사라진다.
for (const agent of AGENTS) {
    const report = readAgentTools(agent).orchestration?.workerReport;
    if (report === undefined) continue;
    const named = Object.entries(report)
        .filter(([key]) => key.endsWith("required") || key.endsWith("Required"))
        .filter(([, value]) => Array.isArray(value) && value.length > 0);
    if (named.length === 0) {
        throw new Error(`${agent} 의 전문가 보고가 채워야 할 칸을 하나도 적지 않는다`);
    }
}

// 모델에게 알린 상한과 실제로 주는 몫의 최댓값이 갈리면 상한을 알려 주는 목적 자체가 사라진다.
const DEPTH_NAMES = ["shallow", "normal", "deep"];
for (const agent of AGENTS) {
    const orchestration = readAgentTools(agent).orchestration;
    if (orchestration?.workerMaxTurns === undefined) continue;
    const shares = Object.entries(orchestration).find(([, value]) =>
        value !== null && typeof value === "object" && DEPTH_NAMES.every((name) => name in value));
    if (shares === undefined) {
        throw new Error(`${agent} 이 전문가 몫을 적지 않고 상한만 알린다`);
    }
    const largest = Math.max(...DEPTH_NAMES.map((name) => shares[1][name]));
    if (largest !== orchestration.workerMaxTurns) {
        throw new Error(
            `${agent} 이 모델에게 알린 상한 ${orchestration.workerMaxTurns} 와 가장 깊은 몫 ${largest} 가 다르다`,
        );
    }
}

const executionLimits = readShared("execution.limits.json").kinds;
const limitKinds = Object.keys(executionLimits);
if (limitKinds.sort().join() !== [...AGENTS].sort().join()) {
    throw new Error(`실행 한도를 적은 종류가 에이전트 목록과 다르다 — ${limitKinds.join(", ")}`);
}

const modelRates = readShared("model.rates.json");
const namedModels = Object.entries(executionLimits).flatMap(([kind, limits]) =>
    [limits.defaultModel, limits.fallbackModel, ...limits.allowedModels].map((model) => ({ kind, model })));
const unpricedLimitModels = namedModels.filter(
    ({ model }) => model !== undefined && modelRates.base[model] === undefined,
);
if (unpricedLimitModels.length > 0) {
    const named = unpricedLimitModels.map(({ kind, model }) => `${kind}: ${model}`).join(", ");
    throw new Error(`실행 한도가 단가를 모르는 모델을 가리킨다 — ${named}`);
}
const modelEnvelope = readShared("execution.limits.json").modelEnvelope;
const ENVELOPE_PROSE = ["meaning", "appliesToReason"];
const envelopeModels = Object.keys(modelEnvelope).filter((key) => !ENVELOPE_PROSE.includes(key));
const sharedBudget = readShared("model.envelope.json").sharedOutputBudget?.appliesTo ?? [];
if ([...envelopeModels].sort().join() !== [...sharedBudget].sort().join()) {
    throw new Error(
        `모델 봉투를 덮는 모델이 출력 예산을 나눠 쓰는 모델과 다르다 — ${envelopeModels.join(", ")}`,
    );
}

// 허용 목록 밖의 모델을 기본으로 두면 그 종류는 자기가 거절하는 값으로 실행한다.
const disallowedDefaults = Object.entries(executionLimits)
    .flatMap(([kind, limits]) => [limits.defaultModel, limits.fallbackModel].map((model) => ({ kind, model })))
    .filter(({ kind, model }) => model !== undefined && !executionLimits[kind].allowedModels.includes(model));
if (disallowedDefaults.length > 0) {
    const named = disallowedDefaults.map(({ kind, model }) => `${kind}: ${model}`).join(", ");
    throw new Error(`실행 한도가 허용하지 않은 모델을 기본이나 대체로 둔다 — ${named}`);
}
if (modelRates.cache.writeMultiplier[modelRates.cache.defaultTtl] === undefined) {
    throw new Error(
        `기본 캐시 수명 ${modelRates.cache.defaultTtl} 의 배수를 계약이 적지 않는다`,
    );
}
for (const [model, rate] of Object.entries(modelRates.base)) {
    if (!(rate.input > 0) || !(rate.output > 0)) {
        throw new Error(`${model} 의 단가가 0 이하라 예산을 집행할 수 없다`);
    }
}
const unpricedModels = (readShared("model.envelope.json").sharedOutputBudget?.appliesTo ?? []).filter(
    (model) => modelRates.base[model] === undefined,
);
if (unpricedModels.length > 0) {
    throw new Error(`봉투가 이름으로 가리키나 단가를 적지 않은 모델이 있다 — ${unpricedModels.join(", ")}`);
}

const carried = Object.entries(settingInputs)
    .map(([field, declared]) => `${field} ← ${declared.setting}`)
    .join(" · ");
console.log(`설정이 실행 입력에 실리는 자리 ${Object.keys(settingInputs).length}개를 계약이 갖는다 — ${carried}`);
const overridden = Object.values(carriedEnvelope)
    .map((declared) => `${declared.overrides} ← ${declared.setting}`)
    .join(" · ");
console.log(`설정이 봉투를 덮는 자리 ${Object.keys(carriedEnvelope).length}개를 계약이 갖는다 — ${overridden}`);
console.log(
    `실행 한도를 계약이 갖는 종류 ${limitKinds.length}개 — `
        + limitKinds.map((kind) => `${kind}(${executionLimits[kind].maxTurns}턴)`).join(" · "),
);
console.log(
    `단가를 아는 모델 ${Object.keys(modelRates.base).length}개와 캐시 수명 ` +
        `${Object.keys(modelRates.cache.writeMultiplier).length}개를 계약이 갖는다 — ` +
        `기본 수명 ${modelRates.cache.defaultTtl} 의 쓰기 배수는 ` +
        `${modelRates.cache.writeMultiplier[modelRates.cache.defaultTtl]} 다`,
);

// 레시피와 정리 제안의 원장이 에이전트 원장에 서지 않으면 새 창구가 읽을 자리가 없다.
const ledgerTables = readLedgerTables();
const missingLedgerTables = LEDGER_TABLES.filter((name) => !ledgerTables.includes(name));
if (missingLedgerTables.length > 0) {
    throw new Error(`창구가 읽는 표를 migration 이 세우지 않는다 — ${missingLedgerTables.join(", ")}`);
}

const searchIndex = readSearchIndex("recipes");
const SEARCH_INDEX_PLACES = ["alias", "index", "documentId", "settings", "document", "query"];
const missingSearchIndex = SEARCH_INDEX_PLACES.filter((place) => searchIndex?.[place] === undefined);
if (missingSearchIndex.length > 0) {
    throw new Error(`검색 색인 선언에 있어야 할 자리가 없다 — ${missingSearchIndex.join(", ")}`);
}
const documentFields = Object.keys(searchIndex.document.fields);
const matchFields = searchIndex.query.matchFields;
const strayMatchFields = matchFields.filter((name) => !documentFields.includes(name));
if (strayMatchFields.length > 0) {
    throw new Error(`검색이 색인 문서에 없는 칸을 뒤진다고 적는다 — ${strayMatchFields.join(", ")}`);
}
const outboxTarget = readSearchOutboxTarget();
const declaredTarget = readJson("wire/search.index.json").pipeline.outboxTarget;
if (outboxTarget !== declaredTarget) {
    throw new Error(
        `아웃박스가 받는 대상을 계약과 migration 이 다르게 적는다 — ` +
            `계약은 ${declaredTarget} 이고 migration 은 ${outboxTarget ?? "제약 없음"} 이다`,
    );
}

const ledgerCase = readCase("recipe.ledger");
// 적중이 색인에 없는 칸을 싣겠다고 적으면 그 칸은 언제나 비어서 온다.
const unbackedHitFields = ledgerCase.shapes.recipeSearchHit.fields.filter(
    (name) => !HIT_FIELDS_OUTSIDE_DOCUMENT.includes(name) && !documentFields.includes(name),
);
if (unbackedHitFields.length > 0) {
    throw new Error(`얇은 적중이 색인 문서에 없는 칸을 싣는다고 적는다 — ${unbackedHitFields.join(", ")}`);
}

// 케이스가 적은 창구를 HTTP 표면이 열지 않으면 그 케이스는 아무것도 대조하지 않는다.
const agentRouteKeys = new Set(declaredRoutes.map(routeKey));
const unopenedWindows = ledgerCase.windows
    .map((window) => routeKey({ method: window.method, path: window.path }))
    .filter((key) => !agentRouteKeys.has(key));
if (unopenedWindows.length > 0) {
    throw new Error(`케이스가 적은 창구를 에이전트 표면이 선언하지 않는다 — ${unopenedWindows.join(", ")}`);
}

const archiveCase = readCase("cleanup.archive");
const archiveWindow = archiveCase.surfaces.archive;
if (!declaredPaths.has(normalizePathTemplate(archiveWindow.path))) {
    throw new Error(`조건부 보관이 부르는 경로를 어느 HTTP 표면도 선언하지 않는다 — ${archiveWindow.path}`);
}
// 두 케이스가 같은 거절을 다른 낱말로 적으면 부른 쪽이 한쪽만 알아본다.
const rejectionCodes = ledgerCase.rejections.map((rejection) => rejection.code);
if (!rejectionCodes.includes(archiveCase.rejection.code)) {
    throw new Error(`조건부 보관이 내는 ${archiveCase.rejection.code} 를 원장 케이스의 거절 목록이 갖지 않는다`);
}
const strayTransitionRejections = Object.entries(ledgerCase.transitions.recipe)
    .filter(([, declared]) => declared.rejection !== undefined && !rejectionCodes.includes(declared.rejection))
    .map(([action, declared]) => `${action} 의 ${declared.rejection}`);
if (strayTransitionRejections.length > 0) {
    throw new Error(`상태 전이가 거절 목록에 없는 코드를 낸다 — ${strayTransitionRejections.join(", ")}`);
}

// 낡음 판정을 글로만 적으면 두 축이 경계에서 갈리므로 사례의 답을 비교 규칙으로 다시 센다.
const wrongStaleCases = archiveCase.condition.cases
    .filter((one) => hasActivitySince(one.lastEventAt, one.ifNoActivitySince) !== one.hasActivity)
    .map((one) => one.name);
if (wrongStaleCases.length > 0) {
    throw new Error(`낡음 판정의 사례가 비교 규칙과 다른 답을 적는다 — ${wrongStaleCases.join(" · ")}`);
}

console.log(`레시피와 정리의 원장 표 ${LEDGER_TABLES.length}개를 migration 이 세운다 — ${LEDGER_TABLES.join(", ")}`);
console.log(
    `검색 색인 ${searchIndex.alias} 는 문서의 칸 ${documentFields.length}개를 갖고 그중 ${matchFields.length}개를 뒤진다`,
);
console.log(`색인 아웃박스가 받는 대상은 ${outboxTarget} 하나이며 migration 이 그 값만 받는다`);
console.log(`레시피와 정리의 창구 ${ledgerCase.windows.length}자리를 케이스와 에이전트 표면이 같게 적는다`);
console.log(`낡음 판정의 사례 ${archiveCase.condition.cases.length}개가 비교 규칙과 같은 답을 낸다`);

// 적용 이력이 사건에서도 오므로 그 사건을 읽는 자리를 계약이 갖지 않으면 한 축만 그 행을 만든다.
const projectionCase = readCase("recipe.projection");
const ledgerTopic = readJson("wire/topics.json").ledgerEvents;
if (projectionCase.source.topic !== ledgerTopic.name) {
    throw new Error(
        `프로젝터가 읽는 토픽을 케이스와 토픽 선언이 다르게 적는다 — ` +
            `케이스는 ${projectionCase.source.topic} 이고 선언은 ${ledgerTopic.name} 이다`,
    );
}
if (projectionCase.source.consumerGroup !== ledgerTopic.consumerGroups.agentProjector) {
    throw new Error(
        `에이전트 프로젝터의 소비자 그룹을 케이스와 토픽 선언이 다르게 적는다 — ` +
            `케이스는 ${projectionCase.source.consumerGroup} 이고 선언은 ${ledgerTopic.consumerGroups.agentProjector} 이다`,
    );
}
const missingGuards = PROJECTION_GUARDS.filter((name) => projectionCase.guards[name] === undefined);
if (missingGuards.length > 0) {
    throw new Error(`투영이 행을 만들지 않는 자리에 있어야 할 것이 없다 — ${missingGuards.join(", ")}`);
}
// 투영이 원장에 없는 칸에 쓰겠다고 적으면 그 축은 첫 사건에서 무너진다.
const applicationColumns = readTableColumns(projectionCase.mapping.table);
const strayColumns = Object.keys(projectionCase.mapping.columns).filter(
    (name) => !applicationColumns.includes(name),
);
if (strayColumns.length > 0) {
    throw new Error(
        `투영이 ${projectionCase.mapping.table} 에 없는 칸에 쓴다고 적는다 — ${strayColumns.join(", ")}`,
    );
}
const unmappedColumns = applicationColumns.filter(
    (name) => projectionCase.mapping.columns[name] === undefined,
);
if (unmappedColumns.length > 0) {
    throw new Error(
        `투영이 ${projectionCase.mapping.table} 의 칸을 무엇으로 채우는지 적지 않는다 — ${unmappedColumns.join(", ")}`,
    );
}

// 상류가 없으면 빠져야 하는 도구를 표면이 표시하지 않으면 플러그인이 그 목록을 손으로 적는다.
const mcpTools = readMcpToolNames();
if (mcpTools.join() !== MCP_AGENT_TOOLS.join()) {
    throw new Error(
        `에이전트 표면을 부르는 MCP 도구의 표시가 계약과 다르다 — ` +
            `${MCP_AGENT_TOOLS.join(", ")} 여야 하는데 ${mcpTools.join(", ") || "없음"} 다`,
    );
}

console.log(
    `에이전트 프로젝터는 ${projectionCase.source.topic} 를 ${projectionCase.source.consumerGroup} 으로 읽어 ` +
        `${projectionCase.selection.kind} 하나를 ${projectionCase.mapping.table} 의 칸 ${applicationColumns.length}개로 옮긴다`,
);
console.log(`에이전트 상류가 있어야 서는 MCP 도구 ${mcpTools.length}개를 표면이 표시한다 — ${mcpTools.join(", ")}`);
