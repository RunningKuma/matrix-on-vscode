import * as vscode from "vscode";
import hljs from "highlight.js";

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
                enableCommandUris: true,
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
    panel.webview.html = buildPreviewHtml(panel.webview, title, rendered, detail);
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
                const language = resolveAttachmentLanguage(attachment.name, attachment.url);
                lines.push(`### ${attachment.name}`);
                lines.push("", `\`\`\`${language ?? ""}`, attachment.code, "```", "");
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
        return applySyntaxHighlighting(rendered);
    }

    return `<pre>${escapeHtml(markdown)}</pre>`;
}

function buildPreviewHtml(webview: vscode.Webview, title: string, content: string, detail: AssignmentDetail): string {
    const escapedTitle = escapeHtml(title || "Matrix Assignment");
    const submitPayload = encodeURIComponent(JSON.stringify([{
        id: detail.id,
        courseId: detail.courseId,
        title: detail.title,
        isFinished: detail.isFinished,
        isFullScore: detail.isFullScore
    }]));
    const submitCommandUri = `command:matrix-on-vscode.submitCode?${submitPayload}`;
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
.actions {
    margin-bottom: 1rem;
}
.submit-button {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    text-decoration: none;
}
.submit-button:hover {
    background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
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
pre code.hljs {
    display: block;
    overflow-x: auto;
    padding: 0;
    background: transparent;
    color: inherit;
}
.hljs-comment,
.hljs-quote {
    color: var(--vscode-descriptionForeground, #6a9955);
    font-style: italic;
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section,
.hljs-link,
.hljs-name {
    color: var(--vscode-symbolIcon-keywordForeground, #c586c0);
}
.hljs-string,
.hljs-title,
.hljs-attr,
.hljs-template-tag,
.hljs-template-variable,
.hljs-addition {
    color: var(--vscode-debugTokenExpression-string, #ce9178);
}
.hljs-number,
.hljs-built_in,
.hljs-type,
.hljs-class .hljs-title {
    color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
}
.hljs-variable,
.hljs-attribute,
.hljs-tag,
.hljs-selector-class,
.hljs-selector-id,
.hljs-selector-attr,
.hljs-selector-pseudo,
.hljs-regexp,
.hljs-symbol,
.hljs-bullet {
    color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
}
.hljs-meta,
.hljs-doctag {
    color: var(--vscode-symbolIcon-operatorForeground, #d7ba7d);
}
.hljs-deletion {
    color: var(--vscode-testing-iconFailed, #f14c4c);
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
<div class="actions">
    <a class="submit-button" href="${submitCommandUri}">提交代码</a>
</div>
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

function applySyntaxHighlighting(content: string): string {
    const codeBlockPattern = /<pre><code(?: class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g;

    return content.replace(codeBlockPattern, (_match, className: string | undefined, encodedCode: string) => {
        const code = decodeHtml(encodedCode);
        const hintedLanguage = extractLanguageFromClassName(className);

        try {
            const highlighted = hintedLanguage && hljs.getLanguage(hintedLanguage)
                ? hljs.highlight(code, { language: hintedLanguage, ignoreIllegals: true })
                : hljs.highlightAuto(code);

            const languageClass = highlighted.language ? ` language-${highlighted.language}` : "";
            return `<pre><code class="hljs${languageClass}">${highlighted.value}</code></pre>`;
        } catch (error) {
            return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
        }
    });
}

function extractLanguageFromClassName(className: string | undefined): string | undefined {
    if (!className) {
        return undefined;
    }

    const classes = className.split(/\s+/);
    for (const item of classes) {
        if (item.startsWith("language-")) {
            return normalizeLanguage(item.slice("language-".length));
        }
    }

    return undefined;
}

function resolveAttachmentLanguage(name: string, url: string | undefined): string | undefined {
    const fromName = inferLanguageFromPath(name);
    if (fromName) {
        return fromName;
    }

    if (!url) {
        return undefined;
    }

    const pathPart = url.split(/[?#]/)[0] ?? "";
    const fileName = pathPart.split("/").pop();
    if (!fileName) {
        return undefined;
    }

    return inferLanguageFromPath(fileName);
}

function inferLanguageFromPath(pathLike: string): string | undefined {
    const normalized = pathLike.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }

    if (normalized === "dockerfile") {
        return "dockerfile";
    }

    if (normalized === "makefile") {
        return "makefile";
    }

    const extension = normalized.split(".").pop();
    if (!extension || extension === normalized) {
        return undefined;
    }

    const map: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        java: "java",
        kt: "kotlin",
        kts: "kotlin",
        go: "go",
        rs: "rust",
        c: "c",
        h: "c",
        cc: "cpp",
        cpp: "cpp",
        cxx: "cpp",
        hh: "cpp",
        hpp: "cpp",
        hxx: "cpp",
        cs: "csharp",
        php: "php",
        rb: "ruby",
        swift: "swift",
        lua: "lua",
        pl: "perl",
        sh: "bash",
        bash: "bash",
        zsh: "bash",
        ps1: "powershell",
        sql: "sql",
        json: "json",
        yml: "yaml",
        yaml: "yaml",
        toml: "toml",
        xml: "xml",
        html: "xml",
        xhtml: "xml",
        css: "css",
        scss: "scss",
        less: "less",
        md: "markdown",
        ini: "ini",
        properties: "ini"
    };

    return map[extension];
}

function normalizeLanguage(value: string): string {
    const normalized = value.toLowerCase();

    const aliases: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        sh: "bash",
        shell: "bash",
        yml: "yaml",
        md: "markdown",
        cs: "csharp"
    };

    return aliases[normalized] ?? normalized;
}

function decodeHtml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([\da-fA-F]+);/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, "&");
}
