// Channel-level and tool-level unit/acceptance tests for dsh-plugin-vision.
// Runs against the BUILT lib/ (run `npm run build` first) with a mock ctx.fs
// backed by the real local filesystem, so the full execute() path — including
// the live gateway VLM call — is exercised without a harness process.
import { readFileSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAscii } from "../lib/ascii.js";
import { runDims } from "../lib/dims.js";
import { runOcr } from "../lib/ocr.js";
import { runVlm, VLM_PROMPT } from "../lib/vlm.js";
import { apply } from "../lib/index.js";

const RES = fileURLToPath(new URL("../lib/resources/", import.meta.url));
const UI_CN = "/tmp/ui_cn.png";
const CHART = "/tmp/chart.png";
const EN = "/tmp/vision_test.png";

let passed = 0;
let failed = 0;
function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function fakeFs() {
  return {
    async resolve(filePath, opts = {}) {
      const abs = resolve(opts.cwd ?? process.cwd(), filePath);
      return { displayPath: abs };
    },
    async stat(target) {
      try {
        const s = statSync(target.displayPath);
        return { type: s.isFile() ? "file" : "dir" };
      } catch {
        return undefined;
      }
    },
    async readBytes(target, _signal, maxBytes) {
      // Mirrors the real contract: hard cap, overflow fails FS_TOO_LARGE (no truncation).
      const bytes = readFileSync(target.displayPath);
      if (bytes.length > maxBytes) {
        const error = new Error(`${target.displayPath}: ${bytes.length} bytes exceeds the ${maxBytes}-byte limit`);
        error.code = "FS_TOO_LARGE";
        throw error;
      }
      return bytes;
    },
    processPath(target) {
      return target.displayPath;
    },
  };
}

const execLike = { signal: new AbortController().signal, agent: { session: { header: { cwd: process.cwd() } } } };

// VLM responses are non-deterministic in formatting (spacing, full-width vs
// ASCII punctuation). The exact-glyph ground-truth injection keeps the VALUES
// verbatim; assertions normalize whitespace and punctuation width so benign
// formatting variance does not flake, while a wrong value still fails.
function normalized(text) {
  return String(text)
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[：]/g, ":").replace(/[，]/g, ",")
    .replace(/[。]/g, ".").replace(/[？]/g, "?")
    .replace(/[“”]/g, '"');
}
function includesNormalized(haystack, needle) {
  return normalized(haystack).includes(normalized(needle));
}

async function getKey() {
  const { resolveApiKey } = await import("../lib/credentials.js");
  return resolveApiKey({ get: () => undefined }, { credentialPath: "~/.dsh/.credentials.yaml", credentialKeys: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"] });
}

// --- 1. OCR channel: Chinese UI, all 11 strings, coordinates sane ---
{
  const result = await runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: UI_CN, timeoutMs: 90000 });
  check("OCR channel ok on /tmp/ui_cn.png", result.ok, result.ok ? "" : result.error);
  if (result.ok) {
    const all = result.items.map((i) => i.text).join(" ");
    const expected = ["数据监控中心", "首页", "报表", "用户管理", "今日订单", "1,284", "活跃用户", "3,672", "查看详情", "警告：存储空间剩余 8%", "磁盘使用率 42%"];
    for (const text of expected) check(`OCR contains: ${text}`, all.includes(text));
    check("OCR coordinates within 0..100", result.items.every((i) => i.x >= 0 && i.y >= 0 && i.w >= 0 && i.h >= 0 && i.x + i.w <= 100 && i.y + i.h <= 100));
    check("OCR sorted top-to-bottom", result.items.every((item, idx, arr) => idx === 0 || arr[idx - 1].y >= item.y));
  }
}

// --- 2. OCR channel: chart numbers ---
{
  const result = await runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: CHART, timeoutMs: 90000 });
  check("OCR channel ok on /tmp/chart.png", result.ok, result.ok ? "" : result.error);
  if (result.ok) {
    const all = result.items.map((i) => i.text).join(" ");
    for (const text of ["120", "185", "95", "240", "Q2", "Q3", "Q4", "季度销售额（万元）", "数据来源"]) {
      check(`chart OCR contains: ${text}`, all.includes(text));
    }
    // Vision occasionally misses the single "Q1" glyph (a known Vision blind
    // spot, present in all tested configurations); the VLM channel completes
    // the reading — see the chart VLM assertions below.
  }
}

// --- 3. ASCII channel ---
{
  const result = await runAscii({ scriptPath: `${RES}ascii.py`, imagePath: CHART, timeoutMs: 30000 });
  check("ASCII channel ok on /tmp/chart.png", result.ok, result.ok ? "" : result.error);
  if (result.ok) {
    check("ASCII art is 88 columns wide", result.art.split("\n").every((line) => line.length === 88));
    const distinct = new Set(result.art.replace(/\n/g, "")).size;
    check("ASCII art carries a multi-level gradient", distinct >= 3, `${distinct} distinct chars`);
  }
}

// --- 4. dims channel ---
{
  const ui = await runDims({ scriptPath: `${RES}dims.py`, imagePath: UI_CN, timeoutMs: 30000 });
  check("dims ok on /tmp/ui_cn.png (800x520)", ui.ok && ui.width === 800 && ui.height === 520, ui.ok ? `${ui.width}x${ui.height}` : ui.error);
  const chart = await runDims({ scriptPath: `${RES}dims.py`, imagePath: CHART, timeoutMs: 30000 });
  check("dims ok on /tmp/chart.png (680x460)", chart.ok && chart.width === 680 && chart.height === 460, chart.ok ? `${chart.width}x${chart.height}` : chart.error);
}

// --- 5. VLM channel: Chinese UI with OCR ground truth (exact strings) ---
{
  const ocr = await runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: UI_CN, timeoutMs: 90000 });
  const groundTruth = ocr.ok ? ocr.items.map((i) => i.text).join(" | ") : "";
  const result = await runVlm({
    apiKey: await getKey(),
    gatewayBaseUrl: "https://opencode.ai/zen/go/v1",
    imagePath: UI_CN,
    prepScriptPath: `${RES}prep.py`,
    model: "mimo-v2.5",
    fallbackModels: ["qwen3.6-plus", "kimi-k3"],
    prompt: `${VLM_PROMPT}\n\n[OCR ground truth — trust it for exact strings]:\n${groundTruth}`,
    maxTokens: 1200,
    maxChars: 4000,
    timeoutMs: 120000,
  });
  check("VLM channel ok on /tmp/ui_cn.png", result.ok, result.ok ? result.model : result.error);
  if (result.ok) {
    check("VLM model used", typeof result.model === "string" && result.model.length > 0);
    for (const text of ["数据监控中心", "1,284", "3,672", "8%", "42%"]) {
      check(`VLM text quotes exactly: ${text}`, includesNormalized(result.text, text));
    }
  }
}

// --- 6. VLM channel: chart readings ---
{
  const ocr = await runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: CHART, timeoutMs: 90000 });
  const groundTruth = ocr.ok ? ocr.items.map((i) => i.text).join(" | ") : "";
  const result = await runVlm({
    apiKey: await getKey(),
    gatewayBaseUrl: "https://opencode.ai/zen/go/v1",
    imagePath: CHART,
    prepScriptPath: `${RES}prep.py`,
    model: "mimo-v2.5",
    fallbackModels: ["qwen3.6-plus", "kimi-k3"],
    prompt: `${VLM_PROMPT}\n\n[OCR ground truth — trust it for exact strings]:\n${groundTruth}`,
    maxTokens: 1200,
    maxChars: 4000,
    timeoutMs: 120000,
  });
  check("VLM channel ok on /tmp/chart.png", result.ok, result.ok ? result.model : result.error);
  if (result.ok) {
    for (const value of ["120", "185", "95", "240", "Q1", "Q2", "Q3", "Q4", "数据来源：销售系统"]) {
      check(`VLM chart reading: ${value}`, includesNormalized(result.text, value));
    }
  }
}

// --- 7. English text image (acceptance item 1) ---
{
  const ocr = await runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: EN, timeoutMs: 90000 });
  check("OCR ok on /tmp/vision_test.png", ocr.ok, ocr.ok ? "" : ocr.error);
  if (ocr.ok) {
    const all = ocr.items.map((i) => i.text).join(" ");
    for (const text of ["Hello Vision Test", "Order ID: 12345", "Total: $99.50"]) {
      check(`English OCR contains: ${text}`, all.includes(text));
    }
  }
}

// --- 8. Error paths at the channel level ---
{
  const missing = await runDims({ scriptPath: `${RES}dims.py`, imagePath: "/tmp/definitely-missing-image.png", timeoutMs: 30000 });
  check("dims on missing file degrades with readable error (≤300 chars, no traceback)", !missing.ok && missing.error.length > 0 && missing.error.length <= 300 && !missing.error.includes("Traceback"), missing.ok ? "" : missing.error);
  const notImage = await runDims({ scriptPath: `${RES}dims.py`, imagePath: "/tmp/not-an-image.png", timeoutMs: 30000 });
  check("dims on non-image bytes degrades (PIL rejects)", !notImage.ok);
}

// --- 9. Concurrency: two OCR + two ASCII in parallel ---
{
  const [a, b, c, d] = await Promise.all([
    runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: UI_CN, timeoutMs: 90000 }),
    runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: CHART, timeoutMs: 90000 }),
    runAscii({ scriptPath: `${RES}ascii.py`, imagePath: UI_CN, timeoutMs: 30000 }),
    runAscii({ scriptPath: `${RES}ascii.py`, imagePath: CHART, timeoutMs: 30000 }),
  ]);
  check("concurrent OCR x2 ok", a.ok && b.ok, `${a.ok ? "" : a.error} ${b.ok ? "" : b.error}`);
  check("concurrent ASCII x2 ok", c.ok && d.ok, `${c.ok ? "" : c.error} ${d.ok ? "" : d.error}`);
}

// --- 10. Timeout: 1ms cap on ASCII must terminate the child ---
{
  const result = await runAscii({ scriptPath: `${RES}ascii.py`, imagePath: UI_CN, timeoutMs: 1 });
  check("ascii timeout escalates to error", !result.ok && /timed out/i.test(result.error), result.ok ? "" : result.error);
}

// --- 11. Cancellation: abort mid-OCR kills the child ---
{
  const controller = new AbortController();
  const promise = runOcr({ scriptPath: `${RES}ocr.swift`, imagePath: UI_CN, timeoutMs: 90000, signal: controller.signal });
  setTimeout(() => controller.abort(), 60);
  const result = await promise;
  check("aborted OCR resolves with error", !result.ok, result.ok ? "" : result.error);
}

// --- 12. Full tool definition: schema, execute, render, meta ---
{
  let captured = undefined;
  const sections = [];
  const ctx = {
    get: () => undefined,
    fs: fakeFs(),
    tools: {
      register: (definition) => { captured = definition; },
      get: () => undefined,
    },
    systemPrompt: { section: (s) => { sections.push(s); } },
  };
  apply(ctx, undefined);
  check("apply registers a tool", captured !== undefined && typeof captured.execute === "function");
  check("apply registers the system-prompt section", sections.length === 1 && sections[0].name === "tool:see");
  if (captured !== undefined) {
    check("tool name is 'see'", captured.name === "see");
    check("parameters carry file_path + switches", captured.parameters !== undefined && captured.parameters.type === "object" && captured.parameters.properties?.file_path?.type === "string" && Array.isArray(captured.parameters.required) && captured.parameters.required.includes("file_path") && ["ocr", "ascii", "vlm", "model"].every((k) => k in captured.parameters.properties));
    const value = await captured.execute({ file_path: UI_CN, ocr: true, ascii: true, vlm: false }, execLike);
    check("execute returns canonical path", value.path === UI_CN);
    check("execute returns image dims", value.image.width === 800 && value.image.height === 520);
    check("execute returns 3 channels", ["ocr", "ascii", "vlm"].every((k) => k in value.channels));
    check("ocr channel ok with 11 items", value.channels.ocr.ok && value.channels.ocr.items.length === 11, `${value.channels.ocr.items.length} items`);
    check("ascii channel ok", value.channels.ascii.ok, value.channels.ascii.error ?? "");
    check("vlm channel disabled (vlm:false)", value.channels.vlm.enabled === false && value.channels.vlm.ok === false);
    const rendered = captured.output.render({}, value);
    check("render returns one text block", rendered.length === 1 && rendered[0].type === "text");
    check("render contains the report headings", /# 视觉分析/.test(rendered[0].text) && /## OCR \(macOS Vision, 离线\)/.test(rendered[0].text) && /## ASCII 布局图/.test(rendered[0].text));
    const meta = captured.output.presentationMeta({}, value);
    check("presentationMeta is replayable", meta.path === UI_CN && meta.channels.ocr.itemCount === 11 && meta.channels.vlm.model === null);
    // error paths through execute
    let err = null;
    try { await captured.execute({ file_path: "/tmp/definitely-missing-image.png" }, execLike); } catch (e) { err = e; }
    check("missing file throws structured FsError", err !== null && err.name === "FsError" && err.code === "FS_NOT_FOUND", err ? `${err.name}/${err.code}` : "");
    err = null;
    try { await captured.execute({ file_path: "/tmp/not-an-image.png" }, execLike); } catch (e) { err = e; }
    check("non-image bytes throw VisionError NOT_AN_IMAGE", err !== null && err.name === "VisionError" && err.code === "NOT_AN_IMAGE", err ? `${err.name}/${err.code}` : "");
  }
}

// --- 13. Image above the 8MB magic-read cap: dims probe is authoritative ---
{
  if (!existsSync("/tmp/big_noise.png")) {
    const gen = spawnSync("python3", ["-c", "import random;from PIL import Image;img=Image.new('RGB',(2300,2300));px=img.load();[px.__setitem__((x,y),(random.randrange(256),)*3) for y in range(img.size[1]) for x in range(img.size[0])];img.save('/tmp/big_noise.png');print('BIG_OK')"], { encoding: "utf8", timeout: 120000 });
    check("generate >8MB noise image", gen.status === 0, gen.stderr);
  }
  const big = await runDims({ scriptPath: `${RES}dims.py`, imagePath: "/tmp/big_noise.png", timeoutMs: 30000 });
  check("dims on >8MB image ok (2300x2300)", big.ok && big.width === 2300 && big.height === 2300, big.ok ? `${big.width}x${big.height}` : big.error);
  let captured = undefined;
  apply({ get: () => undefined, fs: fakeFs(), tools: { register: (d) => { captured = d; }, get: () => undefined }, systemPrompt: { section: () => {} } }, undefined);
  const value = await captured.execute({ file_path: "/tmp/big_noise.png", ocr: false, ascii: false, vlm: false }, execLike);
  check("execute on >8MB image passes the magic-check skip and returns dims", value.image.width === 2300 && value.image.height === 2300 && value.channels.ocr.enabled === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
