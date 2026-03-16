export function normalizeErrorMessage(errorMessage: string): string {
    if (!errorMessage) {
        return "未知错误";
    }

    try {
        const parsed = JSON.parse(errorMessage) as { msg?: unknown; message?: unknown };
        if (typeof parsed.msg === "string" && parsed.msg.trim().length > 0) {
            return parsed.msg.trim();
        }

        if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
            return parsed.message.trim();
        }
    } catch {
        return errorMessage;
    }

    return errorMessage;
}
