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
    readLeaseOwnerPaths,
    readLeaseOwnerRejectionRef,
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

const AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"];
const SHARED = [
    "languages.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "execution.budget.json",
    "model.envelope.json",
    "redaction.json",
    "scope.token.json",
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
    "workflow/trace.attributes.yaml",
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
const leaseOwner = intakeCase.leaseOwner;
const LEASE_OWNER_PLACES = ["meaning", "header", "rejection", "paths"];
const missingLeaseOwner = LEASE_OWNER_PLACES.filter((place) => leaseOwner?.[place] === undefined);
if (missingLeaseOwner.length > 0) {
    throw new Error(`리스 소유자 검사에 있어야 할 자리가 없다 — ${missingLeaseOwner.join(", ")}`);
}
const leaseRejection = readLeaseOwnerRejectionRef();
const declaredLeaseRejection = intakeCase.rejections.find((rejection) => rejection.code === leaseOwner.rejection);
if (declaredLeaseRejection === undefined) {
    throw new Error(`리스 소유자 검사가 내는 ${leaseOwner.rejection} 를 거절 목록이 갖지 않는다`);
}
if (leaseRejection.code !== leaseOwner.rejection || leaseRejection.message !== declaredLeaseRejection.message) {
    throw new Error(
        `리스 소유자 거절을 표면과 케이스가 다르게 적는다 — ` +
            `${leaseRejection.code}/${leaseRejection.message} 와 ${leaseOwner.rejection}/${declaredLeaseRejection.message}`,
    );
}
const leasePaths = readLeaseOwnerPaths();
const unguarded = leasePaths.filter((path) => !leaseOwner.paths.includes(path));
const overguarded = leaseOwner.paths.filter((path) => !leasePaths.includes(path));
if (unguarded.length > 0 || overguarded.length > 0) {
    throw new Error(
        `리스 소유자를 요구하는 창구를 표면과 케이스가 다르게 적는다 — ` +
            `${[...unguarded, ...overguarded].join(", ")}`,
    );
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
    const agentId = kind.replace(".", "-");
    const output = readAgentOutput(agentId).schema.properties ?? {};
    const stray = (declared.fromAgentOutput ?? []).filter((field) => output[field] === undefined);
    if (stray.length > 0) {
        throw new Error(`${kind} 의 산출이 에이전트가 내지 않는 ${stray.join(", ")} 를 실으라고 적는다`);
    }
    const unrequired = (declared.fromAgentOutput ?? []).filter((field) => !declared.required.includes(field));
    if (unrequired.length > 0) {
        throw new Error(`${kind} 의 산출이 ${unrequired.join(", ")} 를 실으면서 요구하지 않는다`);
    }
}
console.log(`추적이 나르는 속성 ${traceAttributes.length}개를 계약이 갖는다`);
const scopeToken = readScopeToken();
const SCOPE_TOKEN_PLACES = ["meaning", "prefix", "prefixReason", "shape", "payload", "signature", "secret", "lifetime", "precedence"];
const missingScopeToken = SCOPE_TOKEN_PLACES.filter((place) => scopeToken[place] === undefined);
if (missingScopeToken.length > 0) {
    throw new Error(`실행 자격의 모양에 있어야 할 자리가 없다 — ${missingScopeToken.join(", ")}`);
}
console.log(`실행을 접는 조건 ${SETTLEMENT_PLACES.length}개를 계약이 갖는다`);
console.log(`공급자 요청 식별자의 값 규칙 ${PROVIDER_REQUEST_RULES.length}개를 계약이 갖는다`);
console.log(`첫 토큰까지의 시간에 관한 규칙 ${TTFT_RULES.length}개를 계약이 갖는다`);
console.log(`접수의 자격 검사에 관한 자리 ${CREDENTIAL_CHECK_PLACES.length}개를 계약이 갖는다`);
console.log(`리스 소유자를 요구하는 창구 ${leasePaths.length}자리가 ${leaseOwner.rejection} 로 거절한다`);
console.log(`잡 산출의 칸을 적은 종류 ${Object.keys(jobResults.byKind).length}개 — ${Object.keys(jobResults.byKind).join(", ")}`);
console.log(`예산 페이싱에 관한 자리 ${PACING_PLACES.length}개를 계약이 갖는다`);
console.log(`턴 원장의 정산 규칙 ${TURN_LEDGER_PLACES.length}개를 계약이 갖는다`);
console.log(
    `실행에 매인 자격은 ${scopeToken.prefix} 로 시작해 ${scopeToken.payload.fields.length}개 칸을 ` +
        `${scopeToken.signature.algorithm} 으로 서명한다`,
);
