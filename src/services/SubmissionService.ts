import fetch, { type Response } from "node-fetch";
import { Base64 } from "js-base64";

import {
    type PollSubmissionProgress,
    type PollSubmissionResult,
    type SourceFileForSubmission,
    type SubmissionDetail,
    type SubmissionSummary,
    type SubmitCodeResult
} from "../shared";
import { decodeBody, encodeBody } from "../util/body-encode";

export class SubmissionService {
    private readonly baseUrl: string;

    public constructor(baseUrl: string = "https://matrix.sysu.edu.cn") {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    public async submitCode(
        courseId: number,
        assignmentId: number,
        sourceFiles: SourceFileForSubmission[],
        cookie: string
    ): Promise<SubmitCodeResult> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix，无法提交代码");
        }

        if (!sourceFiles.length) {
            throw new Error("没有可提交的代码文件");
        }

        const submissionBody: Record<string, unknown> = {
            detail: {
                answers: sourceFiles.map((file) => ({
                    name: file.name,
                    code: Base64.encode(file.content)
                }))
            }
        };

        const encodedBody = await encodeBody("aes-256-gcm", submissionBody);
        if (!encodedBody) {
            throw new Error("提交请求编码失败");
        }
        const csrfToken = this.extractCookieValue(cookie, "X-CSRF-Token");
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Matrix-Encode": "aes-256-gcm",
            Cookie: cookie
        };
        if (csrfToken) {
            headers["X-CSRF-Token"] = csrfToken;
        }

        const response = await fetch(`${this.baseUrl}/api/courses/${courseId}/assignments/${assignmentId}/submissions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ encodedBody })
        });

        const payload = await this.parseResponse(response);
        this.ensureOkStatus(payload, "提交代码");
        const submissionId = this.toOptionalNumber(
            payload?.data?.sub_ca_id
            ?? payload?.data?.sub_id
            ?? payload?.data?.submission?.sub_ca_id
            ?? payload?.data?.submission?.sub_id
            ?? payload?.paramData?.submission?.sub_ca_id
            ?? payload?.paramData?.submission?.sub_id
        );
        const sign = this.toOptionalString(payload?.data?.sign ?? payload?.sign);

        return {
            submissionId,
            sign,
            raw: payload
        };
    }

    public async fetchSubmissions(courseId: number, assignmentId: number, cookie: string): Promise<SubmissionSummary[]> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix，无法查询提交记录");
        }

        const response = await fetch(`${this.baseUrl}/api/courses/${courseId}/assignments/${assignmentId}/submissions`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        const payload = await this.parseResponse(response);
        this.ensureOkStatus(payload, "获取提交记录");
        return this.normalizeSubmissionList(payload);
    }

    public async fetchSubmissionDetail(
        courseId: number,
        assignmentId: number,
        submissionId: number,
        cookie: string
    ): Promise<SubmissionDetail> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix，无法查询评测结果");
        }

        const response = await fetch(
            `${this.baseUrl}/api/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: cookie
                }
            }
        );

        const payload = await this.parseResponse(response);
        this.ensureOkStatus(payload, "获取评测详情");
        return this.normalizeSubmissionDetail(payload, submissionId);
    }

    public async pollSubmissionResult(
        courseId: number,
        assignmentId: number,
        cookie: string,
        options?: {
            submissionId?: number;
            intervalMs?: number;
            timeoutMs?: number;
            onProgress?: (progress: PollSubmissionProgress) => void;
        }
    ): Promise<PollSubmissionResult> {
        const intervalMs = options?.intervalMs ?? 2000;
        const timeoutMs = options?.timeoutMs ?? 120000;
        const startedAt = Date.now();
        let attempts = 0;
        let latest: SubmissionSummary | undefined;
        let detail: SubmissionDetail | undefined;
        let noTargetRounds = 0;

        while (Date.now() - startedAt <= timeoutMs) {
            attempts += 1;
            const list = await this.fetchSubmissions(courseId, assignmentId, cookie);
            latest = this.pickTargetSubmission(list, options?.submissionId);
            if (!latest) {
                latest = await this.fetchLastSubmission(courseId, assignmentId, cookie, options?.submissionId);
            }
            if (!latest) {
                noTargetRounds += 1;
            } else {
                noTargetRounds = 0;
            }

            if (noTargetRounds >= 30) {
                if (options?.submissionId !== undefined) {
                    throw new Error(`长时间未查询到提交记录 #${options.submissionId}，提交可能未生效`);
                }
                throw new Error("长时间未查询到提交记录，提交可能未生效");
            }

            if (latest) {
                detail = await this.fetchSubmissionDetail(courseId, assignmentId, latest.id, cookie);
            }

            const elapsedMs = Date.now() - startedAt;
            options?.onProgress?.({
                attempt: attempts,
                elapsedMs,
                latest,
                detail
            });

            if (detail && !this.isJudging(detail.grade)) {
                return {
                    timeout: false,
                    attempts,
                    elapsedMs,
                    latest,
                    detail
                };
            }

            await this.sleep(intervalMs);
        }

        return {
            timeout: true,
            attempts,
            elapsedMs: Date.now() - startedAt,
            latest,
            detail
        };
    }

    public isJudging(grade: number | null | undefined): boolean {
        return grade === undefined || grade === null || grade === -1;
    }

    private pickTargetSubmission(list: SubmissionSummary[], submissionId?: number): SubmissionSummary | undefined {
        if (!list.length) {
            return undefined;
        }

        if (submissionId !== undefined) {
            return list.find((item) => item.id === submissionId);
        }

        return list[0];
    }

    private async fetchLastSubmission(
        courseId: number,
        assignmentId: number,
        cookie: string,
        expectedSubmissionId?: number
    ): Promise<SubmissionSummary | undefined> {
        const response = await fetch(`${this.baseUrl}/api/courses/${courseId}/assignments/${assignmentId}/submissions/last`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        const payload = await this.parseResponse(response);
        this.ensureOkStatus(payload, "获取最近提交记录");
        const entry = this.pickSubmissionEntry(payload);
        if (!entry) {
            return undefined;
        }

        const summary = this.toSubmissionSummary(entry, 0);
        if (expectedSubmissionId !== undefined && summary.id !== expectedSubmissionId) {
            return undefined;
        }
        return summary;
    }

    private normalizeSubmissionList(payload: any): SubmissionSummary[] {
        const source = this.pickSubmissionArray(payload);
        const normalized = source
            .map((entry: any, index: number) => this.toSubmissionSummary(entry, index))
            .sort((a, b) => this.sortBySubmitAtDesc(a.submittedAt, b.submittedAt));

        return normalized;
    }

    private normalizeSubmissionDetail(payload: any, fallbackSubmissionId: number): SubmissionDetail {
        const entry = this.pickSubmissionEntry(payload);
        if (!entry) {
            return {
                id: fallbackSubmissionId
            };
        }

        const summary = this.toSubmissionSummary(entry, 0, fallbackSubmissionId);
        const answers = this.extractAnswers(entry);

        return {
            ...summary,
            answers,
            report: entry?.report,
            raw: entry
        };
    }

    private pickSubmissionArray(payload: any): any[] {
        if (Array.isArray(payload)) {
            return payload;
        }
        if (Array.isArray(payload?.data)) {
            return payload.data;
        }
        if (Array.isArray(payload?.submissions)) {
            return payload.submissions;
        }
        if (Array.isArray(payload?.data?.submissions)) {
            return payload.data.submissions;
        }
        return [];
    }

    private pickSubmissionEntry(payload: any): any {
        if (!payload) {
            return undefined;
        }
        if (payload?.data && !Array.isArray(payload.data)) {
            return payload.data;
        }
        if (payload?.submission) {
            return payload.submission;
        }
        if (payload?.data?.submission) {
            return payload.data.submission;
        }
        if (Array.isArray(payload?.data) && payload.data.length > 0) {
            return payload.data[0];
        }
        if (Array.isArray(payload) && payload.length > 0) {
            return payload[0];
        }
        return payload;
    }

    private extractAnswers(entry: any): Array<{ name: string; code: string }> | undefined {
        if (!Array.isArray(entry?.answers)) {
            return undefined;
        }

        const answers = entry.answers
            .map((item: any) => {
                const name = this.toOptionalString(item?.name ?? item?.filename ?? item?.title);
                const code = this.toOptionalString(item?.code ?? item?.text);
                if (!name || code === undefined) {
                    return undefined;
                }
                return { name, code };
            })
            .filter((item: { name: string; code: string } | undefined): item is { name: string; code: string } => Boolean(item));

        return answers.length ? answers : undefined;
    }

    private toSubmissionSummary(entry: any, index: number, fallbackSubmissionId?: number): SubmissionSummary {
        const fallbackId = fallbackSubmissionId ?? index + 1;
        const id = this.toOptionalNumber(entry?.sub_ca_id ?? entry?.sub_ea_id ?? entry?.sub_id ?? entry?.id) ?? fallbackId;
        const submittedAt = this.toOptionalString(entry?.submit_at ?? entry?.submittedAt ?? entry?.created_at);
        const grade = this.toGrade(entry?.grade ?? entry?.score);

        return {
            id,
            submittedAt,
            grade,
            raw: entry
        };
    }

    private sortBySubmitAtDesc(a?: string, b?: string): number {
        const left = a ? Date.parse(a) : Number.NaN;
        const right = b ? Date.parse(b) : Number.NaN;
        const leftValid = Number.isFinite(left);
        const rightValid = Number.isFinite(right);

        if (leftValid && rightValid) {
            return right - left;
        }
        if (leftValid) {
            return -1;
        }
        if (rightValid) {
            return 1;
        }
        return 0;
    }

    private async parseResponse(response: Response): Promise<any> {
        const rawText = await response.text();

        if (!response.ok) {
            const message = this.extractErrorMessage(rawText) || `请求失败：${response.status}`;
            throw new Error(message);
        }

        if (!rawText) {
            return undefined;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            return rawText;
        }

        if (parsed && typeof parsed === "object" && typeof parsed.type === "string" && typeof parsed.body === "string") {
            const decoded = await decodeBody(parsed.type, parsed.body);
            return decoded ?? parsed;
        }

        return parsed;
    }

    private ensureOkStatus(payload: any, actionName: string): void {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return;
        }

        const status = this.toOptionalString(payload.status);
        if (!status || status.toUpperCase() === "OK") {
            return;
        }

        const message = this.toOptionalString(payload.msg)
            ?? this.toOptionalString(payload.message)
            ?? status;
        throw new Error(`${actionName}失败：${message}`);
    }

    private extractErrorMessage(rawText: string): string | undefined {
        if (!rawText) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(rawText) as { msg?: unknown; message?: unknown; status?: unknown };
            return this.toOptionalString(parsed.msg)
                ?? this.toOptionalString(parsed.message)
                ?? this.toOptionalString(parsed.status)
                ?? rawText;
        } catch {
            return rawText;
        }
    }

    private toOptionalString(value: unknown): string | undefined {
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
        }
        return undefined;
    }

    private toOptionalNumber(value: unknown): number | undefined {
        const num = Number(value);
        if (Number.isFinite(num)) {
            return num;
        }
        return undefined;
    }

    private toGrade(value: unknown): number | null | undefined {
        if (value === null) {
            return null;
        }
        const num = this.toOptionalNumber(value);
        return num ?? undefined;
    }

    private extractCookieValue(cookie: string, key: string): string | undefined {
        if (!cookie || !key) {
            return undefined;
        }

        const segments = cookie.split(";").map((item) => item.trim()).filter(Boolean);
        for (const segment of segments) {
            const separator = segment.indexOf("=");
            if (separator <= 0) {
                continue;
            }
            const cookieKey = segment.slice(0, separator).trim();
            if (cookieKey !== key) {
                continue;
            }
            const rawValue = segment.slice(separator + 1).trim();
            if (!rawValue) {
                return undefined;
            }
            return decodeURIComponent(rawValue);
        }

        return undefined;
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
