// In-session verification helper for the dynamic `see` Plugin.
//
// The dynamic-Plugin Host sandbox has no `require`/`import`, so the gateway
// call runs here, in a spawned Node process, with the SAME openai SDK,
// endpoint, JSON shapes, fallback chain, and empty-content handling as the
// durable package's `src/vlm.ts`. The API key arrives on stdin (never argv or
// env, which `ps` can observe); if the key is null the helper itself falls
// back to reading ~/.dsh/.credentials.yaml through the `yaml` package on
// NODE_PATH. It writes one JSON line to stdout and exits 0 either way; exit
// code 0 with ok:false keeps error transport out of stderr noise.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function localKey() {
  try {
    const yaml = require("yaml");
    const doc = yaml.parse(readFileSync(join(homedir(), ".dsh/.credentials.yaml"), "utf8")) ?? {};
    for (const key of ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"]) {
      if (typeof doc[key] === "string" && doc[key].length > 0) return doc[key];
    }
  } catch {
    // unconfigured
  }
  return null;
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  try {
    const req = JSON.parse(input);
    const apiKey = typeof req.apiKey === "string" && req.apiKey.length > 0 ? req.apiKey : localKey();
    if (!apiKey) {
      process.stdout.write(JSON.stringify({ ok: false, error: "no gateway API key configured" }));
      process.exit(0);
    }
    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey, baseURL: req.gateway, maxRetries: 0 });
    const base64 = readFileSync(req.imagePath).toString("base64");
    const errors = [];
    for (const model of req.models) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: req.prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          }],
          max_tokens: req.maxTokens,
        });
        const message = response.choices?.[0]?.message ?? {};
        const text = (message.content || message.reasoning_content || "").trim();
        if (text.length === 0) throw new Error(`empty response from ${model}`);
        process.stdout.write(JSON.stringify({ ok: true, model, text: text.slice(0, req.maxChars) }));
        process.exit(0);
      } catch (error) {
        errors.push(`${model}: ${String(error?.message ?? error).slice(0, 120)}`);
      }
    }
    process.stdout.write(JSON.stringify({ ok: false, error: errors.join(" | ") }));
    process.exit(0);
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message ?? error).slice(0, 300) }));
    process.exit(0);
  }
});
