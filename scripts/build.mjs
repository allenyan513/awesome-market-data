// Builds README.md and sources.json from data/sources/*.yml.
//
//   node scripts/build.mjs           validate, then write both files
//   node scripts/build.mjs --check   validate, then fail if either file is stale
//
// Every entry is one YAML file; the README is never edited by hand.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SOURCES_DIR = join(root, "data", "sources");
const TEMPLATE = join(root, "scripts", "readme.template.md");
const README = join(root, "README.md");
const JSON_OUT = join(root, "sources.json");

// Order here is the order of the README sections.
const CATEGORIES = {
  filings: "SEC filings and fundamentals",
  prices: "Price and fundamentals APIs",
  ownership: "Ownership, short interest and trading activity",
  macro: "Rates and macro",
  reference: "Reference data and identifiers",
  research: "Research datasets",
  agents: "Agent-ready (MCP servers)",
};

const PRICE = ["free", "freemium", "paid"];
const AUTH = ["none", "key", "user-agent", "account"];
const RIGHT = ["yes", "no", "conditional", "unclear"];
const PIT = ["yes", "partial", "no", "unclear", "n/a"];
const STATUS = ["active", "shut-down"];

const RIGHT_MARK = { yes: "✅", no: "❌", conditional: "🟡", partial: "🟡", unclear: "❔", "n/a": "—" };
const PRICE_LABEL = { free: "Free", freemium: "Free tier", paid: "Paid" };
const AUTH_LABEL = { none: "no key", key: "API key", "user-agent": "no key, declared User-Agent", account: "account" };

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/\S+$/;

function load() {
  const files = readdirSync(SOURCES_DIR).filter((f) => f.endsWith(".yml")).sort();
  return files.map((f) => {
    const file = `data/sources/${f}`;
    try {
      return { id: basename(f, ".yml"), file, ...parse(readFileSync(join(SOURCES_DIR, f), "utf8")) };
    } catch (e) {
      // The usual cause is an unquoted value containing ": ". Quote it.
      console.error(`✗ ${file}: ${e.message.split("\n")[0]}`);
      process.exit(1);
    }
  });
}

function validate(entries) {
  const errors = [];
  const seenUrls = new Map();
  for (const e of entries) {
    const err = (msg) => errors.push(`${e.file}: ${msg}`);
    const oneOf = (value, allowed, field) => {
      if (!allowed.includes(value)) err(`${field} must be one of ${allowed.join(" | ")} (got ${JSON.stringify(value)})`);
    };
    if (!ID.test(e.id)) err("file name must be kebab-case");
    if (typeof e.name !== "string" || !e.name.trim()) err("name is required");
    if (e.status === "shut-down") {
      // A tombstone: what it was and when it went away, nothing to link to.
      if (typeof e.description !== "string" || !e.description.endsWith(".")) err("description is required and ends with a period");
      if (!e.gotchas?.length) err("say when and how it shut down under gotchas");
      continue;
    }
    if (!URL_RE.test(e.url ?? "")) err("url must be an https URL");
    oneOf(e.category, Object.keys(CATEGORIES), "category");
    if (typeof e.description !== "string") err("description is required");
    else {
      if (e.description.length > 160) err(`description is ${e.description.length} chars (max 160)`);
      if (!/^[A-Z0-9]/.test(e.description)) err("description must start with a capital letter or digit");
      if (!e.description.endsWith(".")) err("description must end with a period");
    }
    oneOf(e.price, PRICE, "price");
    oneOf(e.auth, AUTH, "auth");
    if (e.formats !== undefined && !(Array.isArray(e.formats) && e.formats.every((x) => typeof x === "string"))) err("formats must be a list of strings");
    const t = e.terms ?? {};
    if (!URL_RE.test(t.url ?? "")) err("terms.url must be an https URL: no entry without the page its terms come from");
    oneOf(t.store, RIGHT, "terms.store");
    oneOf(t.redistribute, RIGHT, "terms.redistribute");
    oneOf(t.commercial, RIGHT, "terms.commercial");
    const p = e.pit ?? {};
    oneOf(p.value, PIT, "pit.value");
    if (e.gotchas !== undefined && !(Array.isArray(e.gotchas) && e.gotchas.every((g) => typeof g === "string" && g.trim()))) err("gotchas must be a list of strings");
    oneOf(e.status ?? "active", STATUS, "status");
    if (!DATE.test(String(e.verified ?? ""))) err("verified must be a YYYY-MM-DD date");
    if (e.category === "agents") {
      const m = e.mcp ?? {};
      if (!URL_RE.test(m.endpoint ?? "")) err("agents entries need mcp.endpoint (https)");
      oneOf(m.transport, ["remote", "local"], "mcp.transport");
      if (typeof m.read_only !== "boolean") err("mcp.read_only must be true or false");
    }
    const key = (e.url ?? "").replace(/\/+$/, "").toLowerCase();
    if (seenUrls.has(key)) err(`url duplicates ${seenUrls.get(key)}`);
    seenUrls.set(key, e.file);
  }
  return errors;
}

const mark = (v) => RIGHT_MARK[v] ?? "❔";

function access(e) {
  const parts = [PRICE_LABEL[e.price], AUTH_LABEL[e.auth]];
  if (e.rate_limit) parts.push(e.rate_limit);
  if (e.formats?.length) parts.push(e.formats.map((f) => f.toUpperCase()).join(", "));
  let line = parts.join(" · ");
  if (e.price_note) line += ` (${e.price_note})`;
  return line;
}

function rights(e) {
  const t = e.terms;
  return `Store ${mark(t.store)} · Redistribute ${mark(t.redistribute)} · Commercial ${mark(t.commercial)} · Point-in-time ${mark(e.pit.value)} · [terms](${t.url})`;
}

function renderEntry(e) {
  const owner = e.maintainer_project ? " *(maintainer's project)*" : "";
  const lines = [`- [${e.name}](${e.url})${owner} - ${e.description}`];
  lines.push(`  - ${access(e)}`);
  lines.push(`  - ${rights(e)}`);
  if (e.terms.note) lines.push(`  - Terms: ${e.terms.note}`);
  if (e.pit.note) lines.push(`  - Point-in-time: ${e.pit.note}`);
  if (e.mcp) lines.push(`  - MCP: \`${e.mcp.endpoint}\` · ${e.mcp.transport} · ${e.mcp.read_only ? "read-only" : "can write"}${e.mcp.note ? ` · ${e.mcp.note}` : ""}`);
  for (const g of e.gotchas ?? []) lines.push(`  - Gotcha: ${g}`);
  return lines.join("\n");
}

const anchor = (title) => title.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

function renderReadme(entries) {
  const active = entries.filter((e) => (e.status ?? "active") === "active");
  const gone = entries.filter((e) => e.status === "shut-down").sort(byName);
  const used = Object.entries(CATEGORIES).filter(([key]) => active.some((e) => e.category === key));

  const toc = used.map(([, title]) => `- [${title}](#${anchor(title)})`);
  if (gone.length) toc.push("- [Shut down](#shut-down)");
  toc.push("- [Terms at a glance](#terms-at-a-glance)", "- [Contributing](#contributing)");

  const sections = used.map(([key, title]) => {
    const list = active.filter((e) => e.category === key).sort(byName).map(renderEntry);
    return `## ${title}\n\n${list.join("\n\n")}`;
  });
  if (gone.length) {
    const list = gone.map((e) => `- ${e.name} - ${e.description}${e.gotchas?.length ? ` ${e.gotchas[0]}` : ""}`);
    sections.push(`## Shut down\n\nStill linked from old tutorials. Listed so you can stop looking.\n\n${list.join("\n")}`);
  }

  const glance = [
    "| Source | Cost | Store | Redistribute | Commercial | Point-in-time | Verified |",
    "| --- | --- | :-: | :-: | :-: | :-: | --- |",
    ...active
      .slice()
      .sort(byName)
      .map((e) => `| [${e.name}](${e.url}) | ${PRICE_LABEL[e.price]} | ${mark(e.terms.store)} | ${mark(e.terms.redistribute)} | ${mark(e.terms.commercial)} | ${mark(e.pit.value)} | ${e.verified} |`),
  ];

  return readFileSync(TEMPLATE, "utf8")
    .replace("{{COUNT}}", String(active.length))
    .replace("{{TOC}}", toc.join("\n"))
    .replace("{{SECTIONS}}", sections.join("\n\n"))
    .replace("{{GLANCE}}", glance.join("\n"));
}

function renderJson(entries) {
  const out = entries.map(({ file, ...e }) => ({ ...e, status: e.status ?? "active" }));
  return JSON.stringify({ generated_from: "data/sources/*.yml", count: out.length, sources: out }, null, 2) + "\n";
}

const entries = load();
const errors = validate(entries);
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}

const readme = renderReadme(entries);
const json = renderJson(entries);

if (process.argv.includes("--check")) {
  const stale = [
    [README, readme],
    [JSON_OUT, json],
  ].filter(([path, next]) => {
    try {
      return readFileSync(path, "utf8") !== next;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(`✗ ${stale.map(([p]) => basename(p)).join(" and ")} out of date: run \`npm run build\` and commit the result.`);
    process.exit(1);
  }
  console.log(`✓ ${entries.length} entries valid, README.md and sources.json up to date`);
} else {
  writeFileSync(README, readme);
  writeFileSync(JSON_OUT, json);
  console.log(`✓ ${entries.length} entries → README.md, sources.json`);
}
