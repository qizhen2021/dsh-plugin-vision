import { extname } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { FsError } from "@deepseek-ai/dsh-fs";
import { runAscii } from "./ascii.js";
import { resolveApiKey } from "./credentials.js";
import { runDims } from "./dims.js";
import { VisionError, VISION_ERROR_CODES } from "./errors.js";
import { runOcr } from "./ocr.js";
import { runVlm, VLM_PROMPT } from "./vlm.js";
const IMAGE_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
};
/**
 * Byte cap for the magic-number read. `ctx.fs.readBytes` is whole-file with a
 * hard `maxBytes` bound (overflow fails `FS_TOO_LARGE`); the seam has no
 * partial-read primitive. Files above the cap skip the magic check and rely
 * on the dims probe (PIL decode) as the authoritative image validation.
 */
const MAGIC_READ_CAP = 8 * 1024 * 1024;
function bytesMatch(bytes, mediaType) {
    switch (mediaType) {
        case "image/png":
            return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        case "image/jpeg":
            return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        case "image/webp":
            return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        case "image/gif":
            return bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
                (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
        default:
            return false;
    }
}
function parseSeeArgs(args, defaultModel) {
    const filePath = args.file_path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
        throw new VisionError("file_path must be a non-empty string", VISION_ERROR_CODES.INVALID_ARGS);
    }
    const flag = (name) => {
        const value = args[name];
        return value === undefined ? true : value === true;
    };
    const model = typeof args.model === "string" && args.model.trim().length > 0
        ? args.model.trim()
        : defaultModel;
    return { filePath: filePath.trim(), ocr: flag("ocr"), ascii: flag("ascii"), vlm: flag("vlm"), model };
}
const DISABLED = { ok: false, error: "channel disabled" };
export function applySeeTool(ctx, config, resourceDir, runtime) {
    const toolName = ctx.tools.get("see") === undefined ? "see" : "vision_see";
    ctx.systemPrompt.section({
        name: "tool:see",
        order: 100,
        text: "Use the see tool — not read_image — to analyze images when the routed model is text-only: it returns OCR text with positions, ASCII layout, and a vision-model description. Call it with the image file_path.",
    });
    ctx.tools.register(defineTool({
        name: toolName,
        description: "Analyze an image and return structured text: offline OCR with positions, ASCII layout art, and a vision-model semantic description. Works with any model, including text-only ones.",
        parameters: {
            file_path: {
                type: "string",
                required: true,
                description: "Path to the image file, resolved by the filesystem backend.",
            },
            ocr: {
                type: "boolean",
                description: "Include the offline OCR channel (macOS Vision) with positions. Defaults to true.",
            },
            ascii: {
                type: "boolean",
                description: "Include the ASCII layout-art channel. Defaults to true.",
            },
            vlm: {
                type: "boolean",
                description: "Include the vision-model semantic description channel. Defaults to true.",
            },
            model: {
                type: "string",
                description: `Vision model for the semantic channel. Defaults to ${runtime.defaultModel}.`,
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    path: { type: "string", required: true },
                    image: {
                        type: "object",
                        additionalProperties: false,
                        required: true,
                        properties: {
                            width: { type: "integer", required: true },
                            height: { type: "integer", required: true },
                        },
                    },
                    channels: {
                        type: "object",
                        additionalProperties: false,
                        required: true,
                        properties: {
                            ocr: {
                                type: "object",
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    enabled: { type: "boolean", required: true },
                                    ok: { type: "boolean", required: true },
                                    error: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                                    items: {
                                        type: "array",
                                        required: true,
                                        items: {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: {
                                                x: { type: "integer", required: true },
                                                y: { type: "integer", required: true },
                                                w: { type: "integer", required: true },
                                                h: { type: "integer", required: true },
                                                text: { type: "string", required: true },
                                            },
                                        },
                                    },
                                },
                            },
                            ascii: {
                                type: "object",
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    enabled: { type: "boolean", required: true },
                                    ok: { type: "boolean", required: true },
                                    error: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                                    art: { type: "string", required: true },
                                },
                            },
                            vlm: {
                                type: "object",
                                additionalProperties: false,
                                required: true,
                                properties: {
                                    enabled: { type: "boolean", required: true },
                                    ok: { type: "boolean", required: true },
                                    error: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                                    model: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                                    text: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                                },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{
                    type: "text",
                    text: renderSeeReport(value),
                }],
            presentationMeta: (_args, value) => {
                const channels = value.channels;
                return {
                    path: value.path,
                    image: value.image,
                    channels: {
                        ocr: { ok: channels.ocr.ok, itemCount: channels.ocr.items.length },
                        ascii: { ok: channels.ascii.ok, artLength: channels.ascii.art.length },
                        vlm: { ok: channels.vlm.ok, model: channels.vlm.model },
                    },
                };
            },
        },
        isConcurrencySafe: () => true,
        timeoutMs: 240000,
        async execute(args, exec) {
            const input = parseSeeArgs(args, runtime.defaultModel);
            const toolExec = exec;
            const sessionCwd = toolExec.agent?.session?.header?.cwd;
            const target = await ctx.fs.resolve(input.filePath, {
                ...(typeof sessionCwd === "string" && sessionCwd.length > 0 ? { cwd: sessionCwd } : {}),
                signal: toolExec.signal,
            });
            const info = await ctx.fs.stat(target, toolExec.signal);
            if (info === undefined) {
                throw new FsError(`cannot read "${target.displayPath}": not found`, "FS_NOT_FOUND");
            }
            if (info.type !== "file") {
                throw new FsError(`cannot read "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE");
            }
            const extension = extname(target.displayPath).toLowerCase();
            const declared = IMAGE_EXTENSIONS[extension];
            if (declared === undefined) {
                throw new VisionError(`cannot analyze "${target.displayPath}": see only accepts PNG/JPEG/WebP/GIF paths`, VISION_ERROR_CODES.NOT_AN_IMAGE);
            }
            let head = null;
            try {
                head = await ctx.fs.readBytes(target, toolExec.signal, MAGIC_READ_CAP);
            }
            catch (error) {
                if (error?.code !== "FS_TOO_LARGE")
                    throw error;
            }
            if (head !== null && !bytesMatch(head, declared)) {
                throw new VisionError(`cannot analyze "${target.displayPath}": the ${extension} extension declares ${declared}, but the bytes use a different image format; rename the file to match its actual format, or convert it to PNG/JPEG/WebP/GIF`, VISION_ERROR_CODES.NOT_AN_IMAGE);
            }
            const imagePath = ctx.fs.processPath(target);
            const scriptEnv = {
                ...process.env,
                SEE_MAX_SIDE: String(config.maxImageSide),
                SEE_ASCII_WIDTH: String(config.asciiWidth),
            };
            const [dimsResult, ocrResult, asciiResult] = await Promise.all([
                runDims({ scriptPath: `${resourceDir}dims.py`, imagePath, timeoutMs: config.asciiTimeoutMs, signal: toolExec.signal }),
                input.ocr
                    ? runOcr({ scriptPath: `${resourceDir}ocr.swift`, imagePath, timeoutMs: config.ocrTimeoutMs, signal: toolExec.signal })
                    : Promise.resolve(DISABLED),
                input.ascii
                    ? runAscii({ scriptPath: `${resourceDir}ascii.py`, imagePath, timeoutMs: config.asciiTimeoutMs, signal: toolExec.signal })
                    : Promise.resolve(DISABLED),
            ]);
            if (!dimsResult.ok) {
                throw new VisionError(`cannot analyze "${target.displayPath}": ${dimsResult.error}`, VISION_ERROR_CODES.NOT_AN_IMAGE);
            }
            let vlmResult = DISABLED;
            if (input.vlm) {
                const groundTruth = ocrResult.ok ? ocrResult.items.map((item) => item.text).join(" | ") : "";
                vlmResult = await runVlm({
                    apiKey: await resolveApiKey(ctx, config),
                    gatewayBaseUrl: config.gatewayBaseUrl,
                    imagePath,
                    prepScriptPath: `${resourceDir}prep.py`,
                    model: input.model,
                    fallbackModels: config.fallbackModels,
                    prompt: groundTruth.length > 0
                        ? `${VLM_PROMPT}\n\n[OCR ground truth — trust it for exact strings]:\n${groundTruth}`
                        : VLM_PROMPT,
                    maxTokens: config.vlmMaxTokens,
                    maxChars: config.vlmMaxChars,
                    timeoutMs: config.vlmTimeoutMs,
                    signal: toolExec.signal,
                    env: scriptEnv,
                });
            }
            const value = {
                path: target.displayPath,
                image: { width: dimsResult.width, height: dimsResult.height },
                channels: {
                    ocr: {
                        enabled: input.ocr,
                        ok: ocrResult.ok,
                        error: ocrResult.ok ? null : ocrResult.error,
                        items: ocrResult.ok ? ocrResult.items : [],
                    },
                    ascii: {
                        enabled: input.ascii,
                        ok: asciiResult.ok,
                        error: asciiResult.ok ? null : asciiResult.error,
                        art: asciiResult.ok ? asciiResult.art : "",
                    },
                    vlm: {
                        enabled: input.vlm,
                        ok: vlmResult.ok,
                        error: vlmResult.ok ? null : vlmResult.error,
                        model: vlmResult.ok ? vlmResult.model : null,
                        text: vlmResult.ok ? vlmResult.text : null,
                    },
                },
            };
            return value;
        },
    }));
}
function renderSeeReport(value) {
    const lines = [];
    lines.push(`# 视觉分析: ${value.path}`, "");
    const { ocr, ascii, vlm } = value.channels;
    if (ocr.enabled) {
        lines.push("## OCR (macOS Vision, 离线)");
        if (!ocr.ok)
            lines.push(`> 失败: ${ocr.error ?? "unknown error"}`);
        else if (ocr.items.length === 0)
            lines.push("> 未识别到文字");
        else
            for (const item of ocr.items)
                lines.push(`- [x:${item.x}% y:${item.y}% w:${item.w}% h:${item.h}%] ${item.text}`);
        lines.push("");
    }
    if (ascii.enabled) {
        lines.push("## ASCII 布局图 (字符: ' '最暗 → '@'最亮)");
        if (!ascii.ok)
            lines.push(`> 失败: ${ascii.error ?? "unknown error"}`);
        else
            lines.push(ascii.art.trimEnd());
        lines.push("");
    }
    if (vlm.enabled) {
        lines.push("## 语义描述 (视觉模型)");
        if (!vlm.ok)
            lines.push(`> 失败: ${vlm.error ?? "unknown error"}`);
        else {
            lines.push(`> 模型: ${vlm.model ?? ""}  原图: ${value.image.width}x${value.image.height}px`, "");
            lines.push(vlm.text ?? "");
        }
        lines.push("");
    }
    return `${lines.join("\n").trimEnd()}\n`;
}
