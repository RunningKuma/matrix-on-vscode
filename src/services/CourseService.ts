import fetch, { type Response } from "node-fetch";
import { decodeBody } from "../util/body-encode";
import { AssignmentAttachment, AssignmentDetail, AssignmentSummary, CourseSummary } from "../shared";

//TODO: 这个类里面太臃肿了，把assignment的一些方法拆出去
export class CourseService {
    private readonly baseUrl: string;

    public constructor(baseUrl: string = "https://matrix.sysu.edu.cn") {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }   

    
    public async fetchCourses(cookie: string): Promise<CourseSummary[]> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix");
        }

        console.log("[Matrix][CourseService] Fetching courses from API...");
        const response = await fetch(`${this.baseUrl}/api/courses`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        const payload = await this.parseResponse(response);
        const result = this.normalizeCourses(payload);
        console.log(`[Matrix][CourseService] Parsed ${result.length} course(s) from API response.`);
        return result;
    }

    public async fetchAssignments(courseId: number, cookie: string): Promise<AssignmentSummary[]> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix，无法获取题目列表");
        }

        console.log(`[Matrix][CourseService] Fetching assignments for course ${courseId}...`);
        const response = await fetch(`${this.baseUrl}/api/courses/${courseId}/assignments`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        const payload = await this.parseResponse(response);
        const assignments = this.normalizeAssignments(payload, courseId);
        console.log(`[Matrix][CourseService] Parsed ${assignments.length} assignment(s) for course ${courseId}.`);
        return assignments;
    }

    public async fetchAssignmentDetail(courseId: number, assignmentId: number, cookie: string): Promise<AssignmentDetail> {
        if (!cookie) {
            throw new Error("当前未登录 Matrix，无法获取题目详情");
        }

        console.log(`[Matrix][CourseService] Fetching assignment detail for course ${courseId}, assignment ${assignmentId}...`);
        const response = await fetch(`${this.baseUrl}/api/courses/${courseId}/assignments/${assignmentId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        const payload = await this.parseResponse(response);
        const detail = this.normalizeAssignmentDetail(payload, courseId, assignmentId);
        console.log(`[Matrix][CourseService] Parsed assignment detail for course ${courseId}, assignment ${detail.id}.`);
        return detail;
    }

    private async parseResponse(response: Response): Promise<any> {
        const rawText = await response.text();

        if (!response.ok) {
            const message = rawText || `请求失败：${response.status}`;
            console.error("[Matrix][CourseService] API responded with error:", message);
            throw new Error(message);
        }

        if (!rawText) {
            return undefined;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(rawText);
        } catch (error) {
            return rawText;
        }

        if (parsed && typeof parsed === "object" && typeof parsed.type === "string" && typeof parsed.body === "string") {
            console.log(`[Matrix][CourseService] Response body detected as ${parsed.type}, decoding...`);
            const decoded = await decodeBody(parsed.type, parsed.body);
            if (!decoded) {
                console.warn("[Matrix][CourseService] Decoding response body failed, falling back to raw payload.");
            }
            return decoded ?? parsed;
        }

        return parsed;
    }

    private normalizeCourses(payload: any): CourseSummary[] {
        const coursesSource = this.pickCourseList(payload);
        return coursesSource.map((item: any, index: number) => this.toCourse(item, index));
    }

    private pickCourseList(payload: any): any[] {
        if (Array.isArray(payload)) {
            return payload;
        }

        if (Array.isArray(payload?.data)) {
            return payload.data;
        }

        if (Array.isArray(payload?.courses)) {
            return payload.courses;
        }

        if (Array.isArray(payload?.data?.courses)) {
            return payload.data.courses;
        }

        if (Array.isArray(payload?.user_course)) {
            return payload.user_course;
        }

        if (Array.isArray(payload?.userCourses)) {
            return payload.userCourses;
        }

        return [];
    }

    private toCourse(item: any, index: number): CourseSummary {
        const id = this.toNumber(item?.course_id ?? item?.id ?? item?.courseId ?? index + 1, index + 1);
        const title = this.toString(item?.name ?? item?.course_name ?? item?.title, `课程 ${id}`);
        const code = this.toOptionalString(item?.course_code ?? item?.code ?? item?.courseCode);
        const term = this.toOptionalString(item?.term ?? item?.semester ?? item?.school_year);
        const state = this.toOptionalString(item?.status);
        const endAt = this.toOptionalString(item?.end_at ?? item?.enddate ?? item?.close_time ?? item?.finish_at ?? item?.endTime);
    const assignments = this.extractAssignments(item, id);
        const isOngoing = this.isCourseOngoing(state, endAt, assignments);

        console.log(`[Matrix][CourseService] Normalized course ${title} (${id}) -> state=${state ?? "unknown"}, ongoing=${isOngoing}`);

        return {
            id,
            title,
            code,
            term,
            state,
            endAt,
            isOngoing,
            assignments,
            raw: item
        };
    }

    private extractAssignments(item: any, courseId: number): AssignmentSummary[] {
        const candidate = item?.assignments
            ?? item?.course_assignments
            ?? item?.assignment_list
            ?? item?.problem_set
            ?? item?.courseAssignments
            ?? [];

        const list = Array.isArray(candidate) ? candidate : [];

        return list.map((entry: any, index: number) => this.toAssignment(entry, courseId, index));
    }

    private normalizeAssignments(payload: any, courseId: number): AssignmentSummary[] {
        if (Array.isArray(payload)) {
            return payload.map((entry, index) => this.toAssignment(entry, courseId, index));
        }

        if (Array.isArray(payload?.data)) {
            return payload.data.map((entry: any, index: number) => this.toAssignment(entry, courseId, index));
        }

        if (Array.isArray(payload?.assignments)) {
            return payload.assignments.map((entry: any, index: number) => this.toAssignment(entry, courseId, index));
        }

        return [];
    }

    private normalizeAssignmentDetail(payload: any, courseId: number, assignmentId: number): AssignmentDetail {
        const entry = this.pickAssignmentDetail(payload);

        if (!entry) {
            console.warn(`[Matrix][CourseService] Assignment detail payload empty for course ${courseId}, assignment ${assignmentId}.`);
            return {
                id: assignmentId,
                courseId,
                title: `题目 ${assignmentId}`,
                isFinished: false,
                isFullScore: false
            };
        }

        const summary = this.toAssignment(entry, courseId, 0);
        const normalizedId = this.toNumber(entry?.ca_id ?? entry?.asgn_id ?? entry?.assignment_id ?? entry?.id, assignmentId);
        const description = this.toOptionalString(entry?.description ?? entry?.content ?? entry?.body ?? entry?.desc ?? entry?.statement);
        const attachments = this.extractAttachments(entry);

        return {
            ...summary,
            id: normalizedId,
            description: description ?? undefined,
            attachments,
            raw: entry
        };
    }

    private pickAssignmentDetail(payload: any): any {
        if (!payload) {
            return undefined;
        }

        if (Array.isArray(payload)) {
            return payload[0];
        }

        if (Array.isArray(payload?.data)) {
            return payload.data[0];
        }

        if (payload?.data?.assignment) {
            return payload.data.assignment;
        }

        if (payload?.data?.assignmentDetail) {
            return payload.data.assignmentDetail;
        }

        if (payload?.data?.detail) {
            return payload.data.detail;
        }

        if (payload?.assignment) {
            return payload.assignment;
        }

        if (payload?.assignmentDetail) {
            return payload.assignmentDetail;
        }

        if (payload?.detail) {
            return payload.detail;
        }

        if (payload?.data) {
            return payload.data;
        }

        return payload;
    }

    private extractAttachments(entry: any): AssignmentAttachment[] | undefined {
        const buckets: any[] = [];
        const candidates = [
            entry?.files,
            entry?.attachments,
            entry?.resources,
            entry?.materials,
            entry?.config?.files,
            entry?.config?.attachments
        ];

        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                buckets.push(...candidate);
            }
        }

        if (buckets.length === 0) {
            return undefined;
        }

        const attachments: AssignmentAttachment[] = [];

        for (const item of buckets) {
            const name = this.toOptionalString(item?.name ?? item?.filename ?? item?.title ?? item?.label);
            const url = this.toOptionalString(item?.url ?? item?.download_url ?? item?.link ?? item?.href);
            const code = typeof item?.code === "string" ? item.code : undefined;

            if (!name && !url && !code) {
                continue;
            }

            attachments.push({
                name: name ?? (url ? url : "未命名附件"),
                url: url ?? undefined,
                code
            });
        }

        return attachments.length ? attachments : undefined;
    }

    private toAssignment(entry: any, courseId: number, index: number): AssignmentSummary {
        const id = this.toNumber(entry?.ca_id ?? entry?.asgn_id ?? index + 1, index + 1);
        const title = this.toString(entry?.title , `题目 ${id}`);
        const startAt = this.toOptionalString(entry?.startdate ?? entry?.start_at ?? entry?.startTime);
        const deadline = this.toOptionalString(entry?.enddate ?? entry?.due_at ?? entry?.deadline ?? entry?.endTime);
        const status = this.toOptionalString(entry?.status ?? entry?.state ?? (entry?.finished === true ? "finished" : undefined));
        const score = this.toOptionalNumber(entry?.grade ?? entry?.score);
        const maxScore = this.toOptionalNumber(entry?.standard_score ?? entry?.total_score ?? entry?.max_grade ?? entry?.maxScore);
        const submitTimes = this.toOptionalNumber(entry?.submit_times ?? entry?.submitTimes ?? entry?.submissions);
        const isFinished = this.resolveFinished(entry, status, deadline);
        const isFullScore = this.resolveFullScore(score, maxScore, isFinished);

        return {
            id,
            courseId,
            title,
            startAt,
            deadline,
            status,
            score: score ?? undefined,
            maxScore: maxScore ?? undefined,
            submitTimes: submitTimes ?? undefined,
            isFinished,
            isFullScore,
            raw: entry
        };
    }

    private toNumber(value: unknown, fallback: number): number {
        const result = Number(value);
        if (Number.isFinite(result)) {
            return result;
        }
        return fallback;
    }

    private toString(value: unknown, fallback: string): string {
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
        }
        return fallback;
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

    private resolveFinished(entry: any, status: string | undefined, deadline: string | undefined): boolean {
        if (typeof entry?.finished === "boolean") {
            return entry.finished;
        }

        if (status) {
            const normalized = status.toLowerCase();
            if (/(finish|done|completed|closed|ended|graded|已完成|已截止|已关闭)/.test(normalized)) {
                return true;
            }
        }

        if (typeof entry?.is_finished === "boolean") {
            return entry.is_finished;
        }

        if (deadline) {
            const endTime = Date.parse(deadline);
            if (!Number.isNaN(endTime)) {
                const now = Date.now();
                if (endTime < now) {
                    return true;
                }
            }
        }

        return false;
    }

    private resolveFullScore(score: number | undefined, maxScore: number | undefined, isFinished: boolean): boolean {
        if (score === undefined || maxScore === undefined || maxScore === 0) {
            return false;
        }

        if (isFinished) {
            return Math.abs(score - maxScore) < 1e-6;
        }

        return false;
    }

    private isCourseOngoing(state: string | undefined, endAt: string | undefined, assignments: AssignmentSummary[]): boolean {
        const stateNormalized = (state ?? "").toLowerCase();
        if (stateNormalized) {
            if (stateNormalized === "close") {
                return false;
            }
            else
            if (stateNormalized === "ongoing") {
                return true;
            }
        }

        if (endAt) {
            const endTime = Date.parse(endAt);
            if (!Number.isNaN(endTime)) {
                const now = Date.now();
                if (endTime < now) {
                    return false;
                }
                return true;
            }
        }

        const upcomingDeadline = assignments
            .map((assignment) => assignment.deadline ? Date.parse(assignment.deadline) : undefined)
            .filter((value): value is number => value !== undefined && !Number.isNaN(value))
            .sort((a, b) => a - b)[0];

        if (upcomingDeadline !== undefined) {
            return upcomingDeadline >= Date.now();
        }

        return true;
    }
}
