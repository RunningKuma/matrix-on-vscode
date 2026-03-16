import * as assert from "assert";
import { normalizeErrorMessage } from "../util/error-message";

suite("normalizeErrorMessage", () => {
    test("should keep plain text error", () => {
        assert.strictEqual(normalizeErrorMessage("尚未登录"), "尚未登录");
    });

    test("should pick msg field from JSON error payload", () => {
        assert.strictEqual(
            normalizeErrorMessage("{\"code\":401,\"msg\":\"未登录\"}"),
            "未登录"
        );
    });

    test("should pick message field from JSON error payload", () => {
        assert.strictEqual(
            normalizeErrorMessage("{\"message\":\"forbidden\"}"),
            "forbidden"
        );
    });
});
