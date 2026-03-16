import * as vscode from "vscode";
import { Base64 } from "js-base64";

import { globalState } from "../globalState";
import { CourseService } from "../services/CourseService";
import { SubmissionService } from "../services/SubmissionService";
import { type AssignmentDetail, type AssignmentSummary, type PollSubmissionResult } from "../shared";
import { normalizeErrorMessage } from "../util/error-message";

const courseService = new CourseService();
const submissionService = new SubmissionService();
const submissionPanels = new Map<string, SubmissionPanelState>();

type SubmissionPanelState = {
    panel: vscode.WebviewPanel;
    assignment: AssignmentSummary;
    detail: AssignmentDetail;
    busy: boolean;
};

type SubmitMessage = {
    type: "submit";
    payload?: {
        language?: string;
        fileName?: string;
        code?: string;
    };
};

type StageRow = {
    stageName: string;
    status: string;
    score: string;
    caseCount: string;
};

type CaseRow = {
    stageName: string;
    caseName: string;
    status: string;
    timeUsed: string;
    memoryUsed: string;
    description: string;
    stdin: string;
    stdout: string;
    expected: string;
};

export async function openSubmissionPanel(
    context: vscode.ExtensionContext,
    assignmentInput: unknown
): Promise<void> {
    const assignment = resolveAssignmentSummary(assignmentInput);
    if (!assignment) {
        vscode.window.showWarningMessage("请从 Matrix 题目节点发起提交。");
        return;
    }

    const cookie = globalState.getCookie();
    if (!cookie) {
        vscode.window.showErrorMessage("当前未登录 Matrix，无法提交代码。");
        return;
    }

    let detail: AssignmentDetail;
    try {
        detail = await vscode.window.withProgress<AssignmentDetail>({
            location: vscode.ProgressLocation.Notification,
            title: "正在加载提交信息..."
        }, () => courseService.fetchAssignmentDetail(assignment.courseId, assignment.id, cookie));
    } catch (error) {
        const message = error instanceof Error ? normalizeErrorMessage(error.message) : String(error);
        vscode.window.showErrorMessage(`加载题目信息失败：${message}`);
        return;
    }

    const panelKey = `${assignment.courseId}:${assignment.id}`;
    let state = submissionPanels.get(panelKey);

    if (!state) {
        const panel = vscode.window.createWebviewPanel(
            "matrixAssignmentSubmission",
            `提交代码 - ${detail.title}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        state = {
            panel,
            assignment,
            detail,
            busy: false
        };
        submissionPanels.set(panelKey, state);

        const messageListener = panel.webview.onDidReceiveMessage(async (message: SubmitMessage) => {
            await handlePanelMessage(panelKey, message);
        });
        const disposeListener = panel.onDidDispose(() => submissionPanels.delete(panelKey));
        context.subscriptions.push(panel, messageListener, disposeListener);
    } else {
        state.assignment = assignment;
        state.detail = detail;
        state.panel.reveal(vscode.ViewColumn.Active, true);
    }

    state.panel.title = `提交代码 - ${detail.title}`;
    state.panel.webview.html = buildSubmissionHtml(state.panel.webview, detail.title);
    postMessage(state, {
        type: "init",
        payload: {
            title: detail.title,
            courseId: detail.courseId,
            assignmentId: detail.id,
            languageOptions: detail.languageOptions ?? [],
            submissionFiles: detail.submissionFiles ?? [],
            submitLimitation: detail.submitLimitation
        }
    });
}

async function handlePanelMessage(panelKey: string, message: SubmitMessage): Promise<void> {
    if (!message || message.type !== "submit") {
        return;
    }

    const state = submissionPanels.get(panelKey);
    if (!state) {
        return;
    }

    if (state.busy) {
        postMessage(state, {
            type: "status",
            payload: {
                text: "已有提交流程正在进行，请稍候。"
            }
        });
        return;
    }

    const code = (message.payload?.code ?? "").trim();
    if (!code) {
        postMessage(state, {
            type: "error",
            payload: {
                message: "代码不能为空。"
            }
        });
        return;
    }

    const fileName = pickSubmissionFileName(state.detail, message.payload?.fileName);
    const language = pickLanguage(state.detail, message.payload?.language);

    const cookie = globalState.getCookie();
    if (!cookie) {
        postMessage(state, {
            type: "error",
            payload: {
                message: "登录状态已失效，请重新登录后再提交。"
            }
        });
        return;
    }

    state.busy = true;
    postMessage(state, { type: "busy", payload: { busy: true } });
    postMessage(state, {
        type: "status",
        payload: {
            text: "正在提交代码...",
            replace: true
        }
    });

    try {
        const submitResult = await submissionService.submitCode(
            state.assignment.courseId,
            state.assignment.id,
            [{ name: fileName, content: code }],
            cookie
        );

        const requestedSubId = submitResult.submissionId;
        postMessage(state, {
            type: "status",
            payload: {
                text: requestedSubId
                    ? `提交成功，submission #${requestedSubId}${language ? `，语言 ${language}` : ""}，正在等待评测...`
                    : `提交成功${language ? `（语言 ${language}）` : ""}，正在等待评测...`
            }
        });

        const pollingResult = await submissionService.pollSubmissionResult(
            state.assignment.courseId,
            state.assignment.id,
            cookie,
            {
                submissionId: requestedSubId,
                intervalMs: 2000,
                timeoutMs: 120000,
                onProgress: (progress) => {
                    const phaseText = describePollingProgress(progress.detail?.grade);
                    const suffix = progress.latest?.id ? `#${progress.latest.id}` : "尚未分配提交编号";
                    postMessage(state, {
                        type: "status",
                        payload: {
                            text: `轮询第 ${progress.attempt} 次：${phaseText}（${suffix}）`
                        }
                    });
                }
            }
        );

        const resultPayload = buildResultPayload(pollingResult);
        postMessage(state, {
            type: "result",
            payload: resultPayload
        });

        postMessage(state, {
            type: "status",
            payload: {
                text: pollingResult.timeout
                    ? "评测查询超时，已展示当前可获取的最新结果。"
                    : "评测已完成。"
            }
        });
    } catch (error) {
        const messageText = error instanceof Error ? normalizeErrorMessage(error.message) : String(error);
        postMessage(state, {
            type: "error",
            payload: {
                message: `提交失败：${messageText}`
            }
        });
    } finally {
        state.busy = false;
        postMessage(state, { type: "busy", payload: { busy: false } });
    }
}

function resolveAssignmentSummary(assignmentInput: unknown): AssignmentSummary | undefined {
    if (isAssignmentSummary(assignmentInput)) {
        return assignmentInput;
    }

    if (assignmentInput && typeof assignmentInput === "object") {
        const embedded = (assignmentInput as { assignment?: unknown }).assignment;
        if (isAssignmentSummary(embedded)) {
            return embedded;
        }
    }

    return undefined;
}

function isAssignmentSummary(value: unknown): value is AssignmentSummary {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value as Partial<AssignmentSummary>;
    return typeof candidate.id === "number"
        && typeof candidate.courseId === "number"
        && typeof candidate.title === "string";
}

function pickSubmissionFileName(detail: AssignmentDetail, preferred?: string): string {
    const preferredTrimmed = preferred?.trim();
    if (preferredTrimmed) {
        return preferredTrimmed;
    }
    if (detail.submissionFiles && detail.submissionFiles.length > 0) {
        return detail.submissionFiles[0];
    }
    return "main.cpp";
}

function pickLanguage(detail: AssignmentDetail, preferred?: string): string | undefined {
    const preferredTrimmed = preferred?.trim();
    if (preferredTrimmed) {
        if (detail.languageOptions?.includes(preferredTrimmed)) {
            return preferredTrimmed;
        }
        if (!detail.languageOptions || detail.languageOptions.length === 0) {
            return undefined;
        }
    }
    if (detail.languageOptions && detail.languageOptions.length > 0) {
        return detail.languageOptions[0];
    }
    return undefined;
}

function describePollingProgress(grade: number | null | undefined): string {
    if (submissionService.isJudging(grade)) {
        return "评测中";
    }
    return "已完成";
}

function buildResultPayload(result: PollSubmissionResult): Record<string, unknown> {
    const detail = result.detail;
    const report = detail?.report;
    const stageRows = extractStageRows(report);
    const caseRows = extractCaseRows(report);
    const verdict = resolveVerdict(detail?.grade, report);
    const reportSummary = extractReportSummary(report);

    return {
        verdict,
        grade: formatGrade(detail?.grade),
        submissionId: detail?.id ?? result.latest?.id,
        submittedAt: detail?.submittedAt ?? result.latest?.submittedAt,
        timeout: result.timeout,
        attempts: result.attempts,
        summary: reportSummary,
        stageRows,
        caseRows
    };
}

function resolveVerdict(grade: number | null | undefined, report: unknown): string {
    if (submissionService.isJudging(grade)) {
        return "Judging";
    }

    const stageRows = extractStageRows(report);
    const caseRows = extractCaseRows(report);
    const failedCompile = stageRows.find((stage) => stage.status === "失败" && /编译|compile/i.test(stage.stageName));
    if (failedCompile) {
        return "CE";
    }

    const firstFailedCase = caseRows.find((item) => item.status === "失败");
    if (firstFailedCase) {
        return mapDescriptionToVerdict(firstFailedCase.description) ?? "FAILED";
    }

    if (caseRows.length > 0 && caseRows.every((item) => item.status === "通过")) {
        return "AC";
    }

    if (stageRows.length > 0 && stageRows.every((item) => item.status === "通过")) {
        return "AC";
    }

    const reportObj = asReportObject(report);
    const compileCheck = reportObj?.CompileCheck as Record<string, unknown> | undefined;
    if (compileCheck && compileCheck.pass === false) {
        return "CE";
    }

    const stdCheck = (reportObj?.StandardCheck ?? reportObj?.RandomCheck) as Record<string, unknown> | undefined;
    const testReport = Array.isArray(stdCheck?.report) ? stdCheck?.report as Array<Record<string, unknown>> : [];
    const failedCase = testReport.find((item) => {
        const resultCode = typeof item?.result === "string" ? item.result : undefined;
        return resultCode && resultCode !== "AC" && resultCode !== "OK";
    });
    if (failedCase && typeof failedCase.result === "string") {
        return failedCase.result;
    }

    if (stdCheck?.pass === true) {
        return "AC";
    }

    if (typeof grade === "number") {
        if (grade > 0) {
            return "Accepted";
        }
        return "Scored";
    }

    return "Unknown";
}

function extractReportSummary(report: unknown): string | undefined {
    const stageRows = extractStageRows(report);
    const caseRows = extractCaseRows(report);

    if (caseRows.length > 0) {
        const failedCase = caseRows.find((item) => item.status === "失败");
        if (failedCase) {
            return `${failedCase.stageName} / ${failedCase.caseName}：${failedCase.description}`;
        }

        const passedCases = caseRows.filter((item) => item.status === "通过").length;
        return `共 ${stageRows.length || 1} 个阶段，${passedCases}/${caseRows.length} 个数据点通过`;
    }

    const reportObj = asReportObject(report);
    if (!reportObj) {
        return undefined;
    }

    const compileCheck = reportObj.CompileCheck as Record<string, unknown> | undefined;
    if (compileCheck?.pass === false) {
        const compileMessage = toOptionalString(compileCheck.report)
            ?? toOptionalString((compileCheck.error as Record<string, unknown> | undefined)?.message);
        return compileMessage ? `编译失败：${compileMessage}` : "编译失败";
    }

    const stdCheck = (reportObj.StandardCheck ?? reportObj.RandomCheck) as Record<string, unknown> | undefined;
    const testReport = Array.isArray(stdCheck?.report) ? stdCheck?.report as Array<Record<string, unknown>> : [];
    const failedCase = testReport.find((item) => {
        const resultCode = toOptionalString(item.result);
        return resultCode !== undefined && resultCode !== "AC" && resultCode !== "OK";
    });
    if (failedCase) {
        const caseResult = toOptionalString(failedCase.result);
        const caseError = toOptionalString(failedCase.error);
        const caseOutput = toOptionalString(failedCase.output);
        return [caseResult, caseError, caseOutput].filter(Boolean).join(" | ");
    }

    return undefined;
}

function asReportObject(report: unknown): Record<string, unknown> | undefined {
    if (!report || typeof report !== "object" || Array.isArray(report)) {
        return undefined;
    }
    return report as Record<string, unknown>;
}

function extractStageRows(report: unknown): StageRow[] {
    const reportObj = asReportObject(report);
    const stages = Array.isArray(reportObj?.stages) ? reportObj.stages as Array<Record<string, unknown>> : [];
    if (stages.length === 0) {
        return [];
    }

    return stages.map((stage, index) => {
        const stageName = toOptionalString(stage.name) ?? `阶段 ${index + 1}`;
        const stageStatus = formatStatus(stage.status);
        const score = formatScore(
            toOptionalNumber(stage.score),
            toOptionalNumber(stage.full_score ?? stage.fullScore)
        );
        const caseCount = Array.isArray(stage.cases) ? stage.cases.length : 0;

        return {
            stageName,
            status: stageStatus,
            score,
            caseCount: String(caseCount)
        };
    });
}

function extractCaseRows(report: unknown): CaseRow[] {
    const reportObj = asReportObject(report);
    const stages = Array.isArray(reportObj?.stages) ? reportObj.stages as Array<Record<string, unknown>> : [];
    if (stages.length === 0) {
        return [];
    }

    const rows: CaseRow[] = [];
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
        const stage = stages[stageIndex];
        const stageName = toOptionalString(stage.name) ?? `阶段 ${stageIndex + 1}`;
        const cases = Array.isArray(stage.cases) ? stage.cases as Array<Record<string, unknown>> : [];
        for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
            const caseItem = cases[caseIndex];
            const caseName = toOptionalString(caseItem.name) ?? `数据点 ${caseIndex}`;
            const status = formatStatus(caseItem.status);
            const timeUsed = formatDuration(toOptionalNumber(caseItem.time_used ?? caseItem.timeUsed));
            const memoryUsed = formatMemory(toOptionalNumber(caseItem.memory_used ?? caseItem.memoryUsed));
            const problemsText = extractProblemsText(caseItem.problems);
            const description = compactText(toOptionalString(caseItem.description) ?? problemsText ?? "-", 120);
            const stdin = compactText(decodeDataText(caseItem.stdin) ?? "-", 80);
            const stdout = compactText(decodeDataText(caseItem.stdout) ?? "-", 80);
            const expected = compactText(
                decodeDataText(caseItem.stdout_expect ?? caseItem.stdoutExpect ?? caseItem.expected) ?? "-",
                80
            );

            rows.push({
                stageName,
                caseName,
                status,
                timeUsed,
                memoryUsed,
                description,
                stdin,
                stdout,
                expected
            });
        }
    }

    return rows;
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
    const num = Number(value);
    if (Number.isFinite(num)) {
        return num;
    }
    return undefined;
}

function formatStatus(value: unknown): string {
    const normalized = toOptionalString(value)?.toLowerCase();
    if (!normalized) {
        return "-";
    }
    if (/(accepted|success|ok|pass)/.test(normalized)) {
        return "通过";
    }
    if (/(fail|error|wrong|rejected)/.test(normalized)) {
        return "失败";
    }
    if (/(pending|queue|judg|running|processing)/.test(normalized)) {
        return "评测中";
    }
    return toOptionalString(value) ?? "-";
}

function formatScore(score: number | undefined, fullScore: number | undefined): string {
    if (score === undefined && fullScore === undefined) {
        return "-";
    }
    if (score !== undefined && fullScore !== undefined) {
        return `${score}/${fullScore}`;
    }
    return String(score ?? fullScore);
}

function formatDuration(ms: number | undefined): string {
    if (ms === undefined) {
        return "-";
    }
    return `${ms} ms`;
}

function formatMemory(bytes: number | undefined): string {
    if (bytes === undefined) {
        return "-";
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function extractProblemsText(value: unknown): string | undefined {
    if (!Array.isArray(value) || value.length === 0) {
        return undefined;
    }

    const textList = value
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }
            if (!item || typeof item !== "object") {
                return undefined;
            }
            const obj = item as Record<string, unknown>;
            return toOptionalString(obj.message)
                ?? toOptionalString(obj.description)
                ?? toOptionalString(obj.problem)
                ?? toOptionalString(obj.name);
        })
        .filter((item): item is string => Boolean(item));

    if (!textList.length) {
        return undefined;
    }

    return textList.join("; ");
}

function decodeDataText(value: unknown): string | undefined {
    const text = toOptionalString(value);
    if (text === undefined) {
        return undefined;
    }

    const prefix = "data:text/plain;base64,";
    if (!text.startsWith(prefix)) {
        return text;
    }

    const encoded = text.slice(prefix.length);
    if (encoded.length === 0) {
        return "";
    }

    try {
        return Base64.decode(encoded);
    } catch {
        return text;
    }
}

function compactText(value: string, maxLength: number): string {
    const normalized = value.replace(/\r/g, "").replace(/\n/g, "\\n");
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function mapDescriptionToVerdict(description: string): string | undefined {
    const normalized = description.toLowerCase();
    if (normalized.includes("wrong answer")) {
        return "WA";
    }
    if (normalized.includes("time limit")) {
        return "TLE";
    }
    if (normalized.includes("memory limit")) {
        return "MLE";
    }
    if (normalized.includes("runtime") || normalized.includes("signal")) {
        return "RE";
    }
    if (normalized.includes("compile")) {
        return "CE";
    }
    if (normalized.includes("presentation")) {
        return "PE";
    }
    return undefined;
}

function formatGrade(grade: number | null | undefined): string {
    if (grade === null || grade === -1 || grade === undefined) {
        return "评测中";
    }
    return String(grade);
}

function postMessage(state: SubmissionPanelState, message: Record<string, unknown>): void {
    try {
        state.panel.webview.postMessage(message);
    } catch {
        // Panel may already be disposed while an async polling task is still running.
    }
}

function buildSubmissionHtml(webview: vscode.Webview, title: string): string {
    const escapedTitle = escapeHtml(title || "Matrix Submission");
    const nonce = createNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle}</title>
<style>
:root {
    color-scheme: light dark;
}
body {
    margin: 0;
    padding: 20px;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    line-height: 1.5;
}
main {
    max-width: 980px;
    margin: 0 auto;
}
h1 {
    margin-top: 0;
    font-size: 1.2rem;
}
.meta {
    margin-bottom: 12px;
    color: var(--vscode-descriptionForeground);
}
.row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
}
.field {
    flex: 1 1 220px;
    min-width: 220px;
}
label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.9rem;
}
input, select, textarea, button {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--vscode-input-border, transparent);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    padding: 8px;
    border-radius: 4px;
    font: inherit;
}
textarea {
    min-height: 320px;
    resize: vertical;
    font-family: var(--vscode-editor-font-family, monospace);
}
button {
    width: auto;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    padding: 8px 16px;
}
button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.panel {
    margin-top: 16px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--vscode-editorWidget-border, transparent);
    background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-sideBar-background) 12%);
}
.status-log {
    margin: 0;
    padding-left: 18px;
}
.status-log li {
    margin: 4px 0;
}
.hint {
    margin-top: 8px;
    color: var(--vscode-descriptionForeground);
}
.table-wrap {
    margin-top: 10px;
    overflow-x: auto;
}
table {
    width: 100%;
    border-collapse: collapse;
}
th, td {
    border: 1px solid var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.25));
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
    font-size: 0.88rem;
    white-space: nowrap;
}
td.desc-cell {
    max-width: 380px;
    white-space: normal;
    word-break: break-word;
}
h3 {
    margin: 12px 0 6px;
    font-size: 0.95rem;
}
.empty-table {
    color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>
<main>
    <h1 id="title">${escapedTitle}</h1>
    <div class="meta" id="meta"></div>

    <div class="row">
        <div class="field">
            <label for="language">语言</label>
            <select id="language"></select>
        </div>
        <div class="field">
            <label for="fileName">文件名</label>
            <input id="fileName" type="text" value="main.cpp" />
        </div>
    </div>

    <div class="field">
        <label for="code">代码</label>
        <textarea id="code" placeholder="在此粘贴代码"></textarea>
    </div>

    <div class="row">
        <button id="submitBtn" type="button">提交评测</button>
    </div>

    <section class="panel">
        <h2>状态</h2>
        <ul class="status-log" id="statusLog"></ul>
    </section>

    <section class="panel">
        <h2>结果</h2>
        <div id="resultSummary">暂无结果</div>
        <h3>阶段概览</h3>
        <div id="stageTableWrap" class="table-wrap"></div>
        <h3>数据点详情</h3>
        <div id="caseTableWrap" class="table-wrap"></div>
        <div class="hint" id="resultHint"></div>
    </section>
</main>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const languageEl = document.getElementById("language");
const fileNameEl = document.getElementById("fileName");
const codeEl = document.getElementById("code");
const submitBtn = document.getElementById("submitBtn");
const statusLogEl = document.getElementById("statusLog");
const resultSummaryEl = document.getElementById("resultSummary");
const stageTableWrapEl = document.getElementById("stageTableWrap");
const caseTableWrapEl = document.getElementById("caseTableWrap");
const resultHintEl = document.getElementById("resultHint");

let busy = false;

function setBusy(nextBusy) {
    busy = Boolean(nextBusy);
    submitBtn.disabled = busy;
    languageEl.disabled = busy;
    fileNameEl.disabled = busy;
    codeEl.disabled = busy;
}

function appendStatus(text, replace) {
    if (!text) {
        return;
    }

    if (replace) {
        statusLogEl.innerHTML = "";
    }

    const item = document.createElement("li");
    const now = new Date().toLocaleTimeString();
    item.textContent = "[" + now + "] " + text;
    statusLogEl.appendChild(item);
}

function setLanguageOptions(options) {
    languageEl.innerHTML = "";
    const normalized = Array.isArray(options)
        ? options.map(item => String(item || "").trim()).filter(Boolean)
        : [];

    if (normalized.length === 0) {
        const item = document.createElement("option");
        item.value = "";
        item.textContent = "按后端默认";
        languageEl.appendChild(item);
        return;
    }

    for (const option of normalized) {
        const item = document.createElement("option");
        item.value = String(option);
        item.textContent = String(option);
        languageEl.appendChild(item);
    }
}

function setResult(payload) {
    if (!payload) {
        resultSummaryEl.textContent = "暂无结果";
        stageTableWrapEl.textContent = "";
        caseTableWrapEl.textContent = "";
        resultHintEl.textContent = "";
        return;
    }

    const pieces = [];
    if (payload.verdict) {
        pieces.push("Verdict: " + payload.verdict);
    }
    if (payload.grade) {
        pieces.push("Grade: " + payload.grade);
    }
    if (payload.submissionId) {
        pieces.push("Submission: #" + payload.submissionId);
    }
    if (payload.submittedAt) {
        pieces.push("Submitted At: " + payload.submittedAt);
    }
    if (payload.timeout) {
        pieces.push("Status: Timeout");
    }
    resultSummaryEl.textContent = pieces.length ? pieces.join(" | ") : "暂无结果";
    renderStageTable(Array.isArray(payload.stageRows) ? payload.stageRows : []);
    renderCaseTable(Array.isArray(payload.caseRows) ? payload.caseRows : []);
    resultHintEl.textContent = payload.summary || "";
}

function renderStageTable(rows) {
    const columns = [
        { key: "stageName", label: "阶段" },
        { key: "status", label: "状态" },
        { key: "score", label: "得分" },
        { key: "caseCount", label: "Case 数" }
    ];
    renderTable(stageTableWrapEl, columns, rows, "暂无阶段数据");
}

function renderCaseTable(rows) {
    const columns = [
        { key: "stageName", label: "阶段" },
        { key: "caseName", label: "Case" },
        { key: "status", label: "状态" },
        { key: "timeUsed", label: "耗时" },
        { key: "memoryUsed", label: "内存" },
        { key: "description", label: "说明", className: "desc-cell" },
        { key: "stdin", label: "输入" },
        { key: "stdout", label: "输出" },
        { key: "expected", label: "期望输出" }
    ];
    renderTable(caseTableWrapEl, columns, rows, "暂无数据点信息");
}

function renderTable(container, columns, rows, emptyText) {
    container.innerHTML = "";

    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "empty-table";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const column of columns) {
        const th = document.createElement("th");
        th.textContent = column.label;
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of rows) {
        const tr = document.createElement("tr");
        for (const column of columns) {
            const td = document.createElement("td");
            if (column.className) {
                td.className = column.className;
            }
            const value = row && row[column.key] != null ? String(row[column.key]) : "-";
            td.textContent = value;
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    container.appendChild(table);
}

submitBtn.addEventListener("click", () => {
    if (busy) {
        return;
    }

    const code = codeEl.value || "";
    const fileName = fileNameEl.value || "";
    const language = languageEl.value || undefined;
    vscode.postMessage({
        type: "submit",
        payload: {
            code,
            fileName,
            language
        }
    });
});

window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "init") {
        const payload = message.payload || {};
        if (payload.title) {
            titleEl.textContent = payload.title;
        }
        metaEl.textContent = "Course #" + payload.courseId + " | Assignment #" + payload.assignmentId;
        setLanguageOptions(payload.languageOptions);
        if (Array.isArray(payload.submissionFiles) && payload.submissionFiles.length > 0) {
            fileNameEl.value = payload.submissionFiles[0];
        }
        if (typeof payload.submitLimitation === "number" && payload.submitLimitation > 0) {
            appendStatus("本题提交次数限制：" + payload.submitLimitation, true);
        } else {
            appendStatus("可开始提交。", true);
        }
        setResult(null);
        return;
    }

    if (message.type === "busy") {
        setBusy(message.payload && message.payload.busy);
        return;
    }

    if (message.type === "status") {
        const payload = message.payload || {};
        appendStatus(payload.text, payload.replace);
        return;
    }

    if (message.type === "result") {
        setResult(message.payload || null);
        return;
    }

    if (message.type === "error") {
        const payload = message.payload || {};
        appendStatus(payload.message || "提交失败", false);
    }
});
</script>
</body>
</html>`;
}

function createNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i += 1) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
