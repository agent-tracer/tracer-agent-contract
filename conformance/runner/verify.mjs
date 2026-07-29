import { enforcementLevel, listCases, readCase, readJson, readVersion } from "./contract.mjs";

const AGENTS = ["chat", "recipe-scan", "title-suggestion", "task-cleanup", "rule-generation"];
const SHARED = [
    "language.directives.json",
    "error.subtypes.json",
    "execution.vocabulary.json",
    "prompt.fragment.integrity.json",
    "prompt.placeholders.json",
    "prompt.fragment.manifest.json",
    "evaluation.example.contract.json",
];
const WIRE = ["envelope.json", "headers.json", "topics.json", "job.kinds.json"];

const version = readVersion();
const cases = listCases();
const surfaces = [];

for (const name of cases) readCase(name);

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

if (cases.length === 0) throw new Error("적합성 케이스가 하나도 없다");
if (grouped.unclassified.length > 0) {
    throw new Error(`강제인지 기록인지 정해지지 않은 자리가 있다 — ${grouped.unclassified.join(", ")}`);
}

console.log(`계약 ${version}: 케이스 ${cases.length}개를 읽었다 — ${cases.join(", ")}`);
console.log(`강제 ${grouped.enforced.length}자리, 기록 ${grouped.recorded.length}자리`);
