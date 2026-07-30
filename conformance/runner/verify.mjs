import {
    enforcementLevel,
    listCases,
    normalizePathTemplate,
    readAgentApiRoutes,
    readCase,
    readDeclaredHttpPaths,
    readJson,
    readToolBindingPaths,
    readOpenApiEnum,
    readVersion,
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
    "language.directives.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "prompt.fragment.integrity.json",
    "prompt.fragment.registry.json",
    "prompt.placeholders.json",
    "prompt.fragment.manifest.json",
    "evaluation.example.contract.json",
];
const WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"];
const TOPIC_FIELDS = ["name", "key", "payload", "delivery"];
const FRAGMENT_SURFACES = ["registerAndResolve", "registerCandidate", "promote"];

const version = readVersion();
const cases = listCases();
const surfaces = [];

for (const name of cases) {
    readCase(name);
    surfaces.push(`conformance/cases/${name}.json`);
}

for (const agent of AGENTS) {
    const spec = readJson(`agent/${agent}/spec.json`);
    for (const section of ["tools", "output", "bindings", "prompt"]) {
        if (spec[section] === undefined) continue;
        surfaces.push(`agent/${agent}/spec.json#${section}`);
    }
}
for (const file of SHARED) surfaces.push(`agent/shared/${file}`);
for (const file of WIRE) surfaces.push(`wire/${file}`);
surfaces.push("workflow/queues.yaml", "http/agent-api.openapi.yaml", "http/tracer-dependency.openapi.yaml");

const grouped = { enforced: [], recorded: [], unclassified: [] };
for (const surface of surfaces) grouped[enforcementLevel(surface)].push(surface);

const declaredPaths = new Set(readDeclaredHttpPaths());
const bindings = readToolBindingPaths();
const unmet = bindings.filter((binding) => !declaredPaths.has(normalizePathTemplate(binding.path)));

const registry = readJson("agent/shared/prompt.fragment.registry.json");
const declaredChannels = Object.keys(registry.channels);
const unseenChannels = declaredChannels.filter(
    (channel) => !Object.values(registry.profileChannels).includes(channel)
        && !registry.promotionPath.includes(channel),
);
const unmappedProfiles = Object.entries(registry.profileChannels)
    .filter(([, channel]) => !declaredChannels.includes(channel))
    .map(([profile]) => profile);
const missingFragmentSurfaces = FRAGMENT_SURFACES.filter((name) => registry.surfaces[name] === undefined);
const gatedChannel = registry.promotionPath[registry.promotionPath.length - 1];
const ungatedChannels = registry.promotionGate.ungatedChannels;
const gateMismatch = ungatedChannels.includes(gatedChannel)
    || registry.promotionPath.slice(0, -1).some((channel) => !ungatedChannels.includes(channel));
const prefixedKeys = [registry.identity.definitionKey.example, registry.identity.templateKey.example]
    .concat(registry.identity.codeName.example)
    .filter((value) => registry.identity.rejectedPrefixes.some((prefix) => value.startsWith(prefix)));

const intakeKinds = readCase("job.intake").kinds;
const ledgerKinds = Object.keys(readJson("wire/job.kinds.json").kinds);
const kindMismatch = [
    ["OpenAPI 의 JobKind", readOpenApiEnum("JobKind")],
    ["wire/job.kinds.json", ledgerKinds],
].filter(([, values]) => [...values].sort().join() !== [...intakeKinds].sort().join());

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
if (unmappedProfiles.length > 0) {
    throw new Error(`profile 이 선언되지 않은 조각 채널을 본다 — ${unmappedProfiles.join(", ")}`);
}
if (unseenChannels.length > 0) {
    throw new Error(`어느 profile 도 승격 경로도 닿지 않는 조각 채널이 있다 — ${unseenChannels.join(", ")}`);
}
if (missingFragmentSurfaces.length > 0) {
    throw new Error(`조각 쓰기 경로의 창구가 선언되지 않았다 — ${missingFragmentSurfaces.join(", ")}`);
}
if (gateMismatch) {
    throw new Error(
        `승격 경로의 마지막 채널만 게이트를 가져야 한다 — 경로 ${registry.promotionPath.join(" → ")} · ` +
            `게이트 없는 채널 ${ungatedChannels.join(", ")}`,
    );
}
if (prefixedKeys.length > 0) {
    throw new Error(`조각의 이름이 구현체를 말하는 접두사를 달고 있다 — ${prefixedKeys.join(", ")}`);
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
console.log(`강제 ${grouped.enforced.length}자리, 기록 ${grouped.recorded.length}자리`);
console.log(`도구 ${bindings.length}개가 부르는 경로를 HTTP 표면 ${declaredPaths.size}자리가 덮는다`);
console.log(`접수가 받는 잡 종류 ${intakeKinds.length}개를 세 자리가 같게 적는다 — ${intakeKinds.join(", ")}`);
console.log(
    `조각 채널 ${declaredChannels.length}개를 profile ${Object.keys(registry.profileChannels).length}개가 나눠 보고 ` +
        `판이 어긋나면 ${registry.drift.policy} 하며 ${gatedChannel} 승격이 ${registry.promotionGate.policy} 를 지난다`,
);
console.log(
    `서비스를 넘는 토픽 ${Object.keys(topics).length}개를 선언한다 — ` +
        `${Object.values(topics).map((topic) => topic.name).join(", ")}`,
);
