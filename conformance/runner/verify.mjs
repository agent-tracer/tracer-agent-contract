import { listCases, readAgentSpec, readCase, readJson, readVersion } from "./contract.mjs";

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

for (const name of cases) readCase(name);
for (const agent of AGENTS) readAgentSpec(agent);
for (const file of SHARED) readJson(`agent/shared/${file}`);
for (const file of WIRE) readJson(`wire/${file}`);

if (cases.length === 0) throw new Error("적합성 케이스가 하나도 없다");

console.log(`계약 ${version}: 케이스 ${cases.length}개를 읽었다 — ${cases.join(", ")}`);
