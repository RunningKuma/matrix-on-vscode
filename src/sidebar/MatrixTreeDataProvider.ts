import * as vscode from "vscode";
import { globalState } from "../globalState";
import { matrixManager } from "../MatrixManager";
import { CourseService } from "../services/CourseService";
import { AssignmentSummary, CourseSummary } from "../shared";
import { AssignmentGroupNode, AssignmentNode, CategoryNode, CourseNode, InfoNode, MatrixNode } from "./MatrixNode";

export class MatrixTreeDataProvider implements vscode.TreeDataProvider<MatrixNode> {
    private readonly courseService = new CourseService();
    private readonly changeEmitter = new vscode.EventEmitter<MatrixNode | undefined>();

    private courses: CourseSummary[] = [];
    private loading = false;
    private errorMessage: string | undefined;
    private needsReload = true;
    private readonly assignmentCache = new Map<number, AssignmentCache>();

    public readonly onDidChangeTreeData = this.changeEmitter.event;

    public refresh(options?: { force?: boolean }): void {
        if (options?.force) {
            console.log("[Matrix][Tree] Forced refresh requested, clearing cached courses.");
            this.courses = [];
            this.errorMessage = undefined;
            this.needsReload = true;
            this.assignmentCache.clear();
        }
        this.changeEmitter.fire(undefined);
    }

    public getTreeItem(element: MatrixNode): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: MatrixNode): Promise<MatrixNode[]> {
        if (element instanceof CourseNode) {
            return [
                new AssignmentGroupNode("未完成题目", element.course.id, "pending"),
                new AssignmentGroupNode("已完成题目", element.course.id, "completed")
            ];
        }

        if (element instanceof AssignmentGroupNode) {
            await this.ensureAssignments(element.courseId, element);

            const cache = this.assignmentCache.get(element.courseId);
            if (!cache) {
                return [new InfoNode("暂无题目信息", { iconId: "info" })];
            }

            if (cache.loading) {
                return [new InfoNode("正在加载题目...", { iconId: "sync" })];
            }

            if (cache.error) {
                return [
                    new InfoNode(`题目加载失败：${JSON.parse(cache.error).msg}`, {
                        command: "matrix-on-vscode.refreshCourseAssignments",
                        arguments: [element.courseId],
                        iconId: "warning"
                    })
                ];
            }

            const list = element.group === "pending" ? cache.pending : cache.completed;

            if (!list.length) {
                const label = element.group === "pending" ? "暂无未完成题目" : "暂无已完成题目";
                const icon = element.group === "pending" ? "watch" : "check";
                return [new InfoNode(label, { iconId: icon })];
            }

            return list.map((assignment) => new AssignmentNode(assignment));
        }

        if (element instanceof CategoryNode) {
            const filteredCourses = element.category === "ongoing"
                ? this.courses.filter((course) => course.isOngoing)
                : this.courses.filter((course) => !course.isOngoing);

            console.log(`[Matrix][Tree] Resolving category ${element.category}, course count=${filteredCourses.length}.`);

            if (!filteredCourses.length) {
                const label = element.category === "ongoing" ? "暂无进行中的课程" : "暂无已结束的课程";
                return [new InfoNode(label, { iconId: element.category === "ongoing" ? "clock" : "verified" })];
            }

            return filteredCourses.map((course) => new CourseNode(course));
        }

        if (element) {
            return [];
        }

        if (!matrixManager.isSignedIn()) {
            return [
                new InfoNode("未登录，点击登录", {
                    command: "matrix-on-vscode.signin",
                    iconId: "account"
                })
            ];
        }

        if ((this.needsReload || this.courses.length === 0) && !this.loading) {
            console.log("[Matrix][Tree] Reloading courses before providing root items.");
            await this.loadCourses();
        }

        if (this.loading) {
            return [new InfoNode("正在加载课程...", { iconId: "sync" })];
        }

        if (this.errorMessage) {
            return [
                new InfoNode(`加载失败：${this.errorMessage}`, {
                    command: "matrix-on-vscode.refreshCourses",
                    iconId: "warning"
                })
            ];
        }

        if (!this.courses.length) {
            return [new InfoNode("暂无可显示的课程", { iconId: "book" })];
        }

        return [
            new CategoryNode("进行中的课程", "ongoing"),
            new CategoryNode("已结束的课程", "finished")
        ];
    }

    private async loadCourses(): Promise<void> {
        const cookie = globalState.getCookie();
        if (!cookie) {
            console.warn("[Matrix][Tree] No cookie available while attempting to load courses.");
            this.courses = [];
            this.needsReload = false;
            return;
        }

        console.log("[Matrix][Tree] Starting course load from service.");
        this.loading = true;
        this.errorMessage = undefined;

        try {
            this.courses = await this.courseService.fetchCourses(cookie);
            console.log(`[Matrix][Tree] Loaded ${this.courses.length} course(s).`);
        } catch (error) {
            this.courses = [];
            this.errorMessage = error instanceof Error ? error.message : String(error);
            console.error("[Matrix][Tree] Failed to load courses:", this.errorMessage);
        } finally {
            this.loading = false;
            this.needsReload = false;
        }
    }
    public refreshAssignments(courseId?: number): void {
        if (courseId === undefined) {
            this.assignmentCache.clear();
        } else {
            this.assignmentCache.delete(courseId);
        }
        this.changeEmitter.fire(undefined);
    }

    private async ensureAssignments(courseId: number, contextNode?: MatrixNode): Promise<void> {
        const cached = this.assignmentCache.get(courseId);
        if (cached && !cached.loading && cached.loaded) {
            return;
        }

        const cookie = globalState.getCookie();
        if (!cookie) {
            this.assignmentCache.set(courseId, {
                pending: [],
                completed: [],
                loading: false,
                loaded: true,
                error: "尚未登录"
            });
            return;
        }

        const cacheState: AssignmentCache = cached ?? {
            pending: [],
            completed: [],
            loading: false,
            loaded: false
        };

        cacheState.loading = true;
        cacheState.error = undefined;
        this.assignmentCache.set(courseId, cacheState);
        this.changeEmitter.fire(contextNode);

        try {
            const assignments = await this.courseService.fetchAssignments(courseId, cookie);
            const { pending, completed } = this.splitAssignments(assignments);

            cacheState.pending = pending;
            cacheState.completed = completed;
            cacheState.loaded = true;
            cacheState.error = undefined;

            const course = this.courses.find((item) => item.id === courseId);
            if (course) {
                course.assignments = assignments;
            }

            console.log(`[Matrix][Tree] Loaded ${assignments.length} assignment(s) for course ${courseId}.`);
        } catch (error: any) {
            cacheState.pending = [];
            cacheState.completed = [];
            cacheState.loaded = true;
            cacheState.error = error instanceof Error ? error.message : String(error);
            console.error(`[Matrix][Tree] Failed to load assignments for course ${courseId}:`, cacheState.error);
        } finally {
            cacheState.loading = false;
            this.assignmentCache.set(courseId, cacheState);
            this.changeEmitter.fire(contextNode);
        }
    }

    private splitAssignments(assignments: AssignmentSummary[]): { pending: AssignmentSummary[]; completed: AssignmentSummary[] } {
        const pending: AssignmentSummary[] = [];
        const completed: AssignmentSummary[] = [];

        for (const assignment of assignments) {
            if (assignment.isFinished) {
                completed.push(assignment);
            } else {
                pending.push(assignment);
            }
        }

        return { pending, completed };
    }
}

type AssignmentCache = {
    pending: AssignmentSummary[];
    completed: AssignmentSummary[];
    loading: boolean;
    loaded: boolean;
    error?: string;
};

export const matrixTreeDataProvider = new MatrixTreeDataProvider();