import * as vscode from "vscode";

import { COMMANDS } from "../constants";
import { AssignmentSummary, CourseSummary } from "../shared";

export abstract class MatrixNode extends vscode.TreeItem {
    protected constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}

// 分类节点，如“进行中课程”“已结束课程”
export class CategoryNode extends MatrixNode {
    public readonly category: "ongoing" | "finished";

    public constructor(label: string, category: "ongoing" | "finished") {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.category = category;
        this.contextValue = `matrix.category.${category}`;
        this.iconPath = new vscode.ThemeIcon(category === "ongoing" ? "rocket" : "archive");
    }
}

export class CourseNode extends MatrixNode {
    public readonly course: CourseSummary;

    public constructor(course: CourseSummary) {
        super(course.title, vscode.TreeItemCollapsibleState.Collapsed);
        this.course = course;
        this.contextValue = "matrix.course";
        this.iconPath = new vscode.ThemeIcon("book");
        this.description = this.buildDescription(course);
        this.tooltip = this.buildTooltip(course);
    }

    private buildTooltip(course: CourseSummary): string {
        const lines: string[] = [`课程：${course.title}`];
        if (course.code) {
            lines.push(`课程编号：${course.code}`);
        }
        if (course.term) {
            lines.push(`学期：${course.term}`);
        }
        lines.push(`题目数量：${course.assignments.length}`);
        if (course.state) {
            lines.push(`状态：${course.state}`);
        }
        if (course.endAt) {
            lines.push(`结束时间：${course.endAt}`);
        }
        return lines.join("\n");
    }

    private buildDescription(course: CourseSummary): string | undefined {
        const parts: string[] = [];
        if (course.term) {
            parts.push(course.term);
        } else if (course.code) {
            parts.push(course.code);
        }

        parts.push(course.isOngoing ? "进行中" : "已结束");

        return parts.join(" • ");
    }
}

export class AssignmentGroupNode extends MatrixNode {
    public readonly courseId: number;
    public readonly group: "pending" | "completed";

    public constructor(label: string, courseId: number, group: "pending" | "completed") {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.courseId = courseId;
        this.group = group;
        this.contextValue = `matrix.assignmentGroup.${group}`;
        this.iconPath = new vscode.ThemeIcon(group === "pending" ? "watch" : "checklist");
    }
}

export class AssignmentNode extends MatrixNode {
    public readonly assignment: AssignmentSummary;

    public constructor(assignment: AssignmentSummary) {
        super(assignment.title, vscode.TreeItemCollapsibleState.None);
        this.assignment = assignment;
        this.contextValue = "matrix.assignment";
        this.iconPath = this.resolveIcon(assignment);
        this.description = this.buildDescription(assignment);
        this.tooltip = this.buildTooltip(assignment);
        this.command = {
            command: COMMANDS.PREVIEW_PROBLEM,
            title: "查看题目预览",
            arguments: [assignment]
        };
    }

    private resolveIcon(assignment: AssignmentSummary): vscode.ThemeIcon {
        if (assignment.isFinished && assignment.isFullScore) {
            return new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        }

        if (assignment.isFinished) {
            return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
        }

        return new vscode.ThemeIcon("clock", new vscode.ThemeColor("badge.background"));
    }

    private buildDescription(assignment: AssignmentSummary): string | undefined {
        const parts: string[] = [];

        if (assignment.score !== undefined && assignment.maxScore !== undefined) {
            const icon = assignment.isFullScore ? "分数" : "$(x)";
            parts.push(`${icon} ${assignment.score}/${assignment.maxScore}`);
        }

        if (assignment.deadline) {
            parts.push(this.formatDate(assignment.deadline));
        }

        if (assignment.status) {
            parts.push(assignment.status);
        } else if (!assignment.isFinished) {
            parts.push("进行中");
        }

        return parts.length ? parts.join(" • ") : undefined;
    }

    private buildTooltip(assignment: AssignmentSummary): string {
        const lines: string[] = [`题目：${assignment.title}`];
        if (assignment.startAt) {
            lines.push(`开始时间：${assignment.startAt}`);
        }
        if (assignment.deadline) {
            lines.push(`截止时间：${assignment.deadline}`);
        }
        if (assignment.status) {
            lines.push(`状态：${assignment.status}`);
        }
        if (assignment.score !== undefined && assignment.maxScore !== undefined) {
            lines.push(`得分：${assignment.score}/${assignment.maxScore}`);
        }
        if (assignment.submitTimes !== undefined) {
            lines.push(`提交次数：${assignment.submitTimes}`);
        }
        lines.push(`是否完成：${assignment.isFinished ? "是" : "否"}`);
        return lines.join("\n");
    }

    private formatDate(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString();
    }
}

export class InfoNode extends MatrixNode {
    public constructor(label: string, options?: { command?: string; arguments?: unknown[]; iconId?: string }) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "matrix.info";
        this.iconPath = new vscode.ThemeIcon(options?.iconId ?? "info");
        if (options?.command) {
            this.command = {
                command: options.command,
                title: label,
                arguments: options.arguments ?? []
            };
        }
    }
}