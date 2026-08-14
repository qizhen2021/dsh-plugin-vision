import { HarnessError } from "@deepseek-ai/dsh-llm";
/**
 * Plugin-owned structured failure. Extends {@link HarnessError} so the tool
 * registry preserves `{ name, code }` on `isError` results — the same exposure
 * convention as `FsError` from `@deepseek-ai/dsh-fs`. `name` is the class
 * name (`VisionError`); route on `code`, never on `message`.
 * @module dsh-plugin-vision/errors
 */
export class VisionError extends HarnessError {
    constructor(message, code, options) {
        super(message, code, options);
    }
}
/** Stable machine-routable codes carried on {@link VisionError}. */
export const VISION_ERROR_CODES = {
    INVALID_ARGS: "INVALID_ARGS",
    NOT_AN_IMAGE: "NOT_AN_IMAGE",
    IMAGE_DIMS_FAILED: "IMAGE_DIMS_FAILED",
};
