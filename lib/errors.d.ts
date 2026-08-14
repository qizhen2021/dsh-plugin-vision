import { HarnessError } from "@deepseek-ai/dsh-llm";
/**
 * Plugin-owned structured failure. Extends {@link HarnessError} so the tool
 * registry preserves `{ name, code }` on `isError` results — the same exposure
 * convention as `FsError` from `@deepseek-ai/dsh-fs`. `name` is the class
 * name (`VisionError`); route on `code`, never on `message`.
 * @module dsh-plugin-vision/errors
 */
export declare class VisionError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
/** Stable machine-routable codes carried on {@link VisionError}. */
export declare const VISION_ERROR_CODES: {
    readonly INVALID_ARGS: "INVALID_ARGS";
    readonly NOT_AN_IMAGE: "NOT_AN_IMAGE";
    readonly IMAGE_DIMS_FAILED: "IMAGE_DIMS_FAILED";
};
