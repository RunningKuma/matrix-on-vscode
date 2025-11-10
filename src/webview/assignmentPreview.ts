import * as vscode from "vscode";

import { globalState } from "../globalState";
import { CourseService } from "../services/CourseService";
import { type AssignmentDetail, type AssignmentSummary } from "../shared";

const courseService = new CourseService();
const previewPanels = new Map<string, vscode.WebviewPanel>();

export async function previewAssignment(
    context: vscode.ExtensionContext,
    assignment: AssignmentSummary | undefined
): Promise<void> {
    if (!assignment) {
        vscode.window.showWarningMessage("请从 Matrix 面板中选择一个题目进行预览。");
        return;
    }

    const cookie = globalState.getCookie();
    if (!cookie) {
        vscode.window.showErrorMessage("当前未登录 Matrix，无法获取题目详情。");
        return;
    }

    let detail: AssignmentDetail;
    try {
        detail = await vscode.window.withProgress<AssignmentDetail>({
            location: vscode.ProgressLocation.Notification,
            title: "正在加载题目详情..."
        }, () => courseService.fetchAssignmentDetail(assignment.courseId, assignment.id, cookie));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`题目预览失败：${message}`);
        return;
    }

    const markdown = buildAssignmentMarkdown(detail);
    const rendered = await renderMarkdown(markdown);
    const panelKey = `${detail.courseId}:${detail.id}`;

    let panel = previewPanels.get(panelKey);
    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            "matrixAssignmentPreview",
            detail.title,
            vscode.ViewColumn.Active,
            {
                enableScripts: false,
                retainContextWhenHidden: true
            }
        );
        const disposeListener = panel.onDidDispose(() => previewPanels.delete(panelKey));
        previewPanels.set(panelKey, panel);
        context.subscriptions.push(panel, disposeListener);
    } else {
        panel.reveal(vscode.ViewColumn.Active, true);
    }

    const title = detail.title ?? assignment.title;
    panel.title = title;
    panel.webview.html = buildPreviewHtml(panel.webview, title, rendered);
}

function buildAssignmentMarkdown(detail: AssignmentDetail): string {
    const lines: string[] = [`# ${detail.title}`];

    const metadata: string[] = [];
    metadata.push(`- **课程 ID**：${detail.courseId}`);
    metadata.push(`- **题目 ID**：${detail.id}`);
    if (detail.status) {
        metadata.push(`- **状态**：${detail.status}`);
    }
    const scoreInfo = formatScore(detail.score, detail.maxScore);
    if (scoreInfo) {
        metadata.push(`- **得分**：${scoreInfo}`);
    }
    if (detail.submitTimes !== undefined) {
        metadata.push(`- **提交次数**：${detail.submitTimes}`);
    }
    
    // metadata.push(`- **分数**：${detail.score}`);
    // metadata.push(`- **完成情况**：${detail.isFinished ? "已完成" : "未完成"}`);
    // if (detail.isFinished) {
    //     metadata.push(`- **是否满分**：${detail.isFullScore ? "是" : "否"}`);
    // }
    const startAt = formatDateTime(detail.startAt);
    if (startAt) {
        metadata.push(`- **开始时间**：${startAt}`);
    }
    const deadline = formatDateTime(detail.deadline);
    if (deadline) {
        metadata.push(`- **截止时间**：${deadline}`);
    }

    if (metadata.length) {
        lines.push("", "## 题目信息", "", ...metadata);
    }

    lines.push("", "## 题目描述", "");
    if (detail.description) {
        lines.push(detail.description.trim());
    } else {
        lines.push("> 暂无题目描述");
    }

    if (detail.attachments?.length) {
        lines.push("", "## 附件", "");
        for (const attachment of detail.attachments) {
            if (attachment.url) {
                lines.push(`- [${attachment.name}](${attachment.url})`);
            } else if (attachment.code) {
                lines.push(`### ${attachment.name}`);
                lines.push("", "```", attachment.code, "```", "");
            } else {
                lines.push(`- ${attachment.name}`);
            }
        }
    }

    return lines.join("\n").trimEnd();
}

async function renderMarkdown(markdown: string): Promise<string> {
    let rendered: string | undefined;
    try {
        rendered = await vscode.commands.executeCommand<string>("markdown.api.render", markdown);
    } catch (error) {
        console.warn("[Matrix][Preview] Failed to render markdown via VS Code markdown API:", error);
    }

    if (typeof rendered === "string" && rendered.length > 0) {
        return rendered;
    }

    return `<pre>${escapeHtml(markdown)}</pre>`;
}

function buildPreviewHtml(webview: vscode.Webview, title: string, content: string): string {
    const escapedTitle = escapeHtml(title || "Matrix Assignment");
    const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline';`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle}</title>
<style>
body {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 1.5rem;
    line-height: 1.6;
}
main {
    max-width: 960px;
    margin: 0 auto;
}
a {
    color: var(--vscode-textLink-foreground);
}
pre, code, .code-block {
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
}
pre {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128, 128, 128, 0.2));
    padding: 0.75rem;
    border-radius: 4px;
    overflow-x: auto;
}
blockquote {
    border-left: 4px solid var(--vscode-editorLineNumber-foreground);
    padding-left: 1rem;
    color: var(--vscode-editor-foreground);
    opacity: 0.85;
}
h1, h2, h3 {
    border-bottom: 1px solid var(--vscode-editorWidget-border);
    padding-bottom: 0.3rem;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
}
table th, table td {
    border: 1px solid var(--vscode-editorWidget-border);
    padding: 0.5rem;
}
</style>
</head>
<body>
<main>
${content}
</main>
</body>
</html>`;
}

function formatDateTime(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    try {
        return new Intl.DateTimeFormat("zh-CN", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
    } catch (error) {
        return date.toLocaleString();
    }
}

function formatScore(score: number | undefined, maxScore: number | undefined): string | undefined {
    if (score === undefined || maxScore === undefined) {
        return undefined;
    }
    return `${score} / ${maxScore}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
