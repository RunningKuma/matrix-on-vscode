import { AssignmentSummary } from "./Assignment.js";

export interface CourseSummary {
    id: number;
    title: string;
    code?: string;
    term?: string;
    state?: string;
    endAt?: string;
    isOngoing: boolean;
    assignments: AssignmentSummary[];
    raw?: unknown;
}

export const defaultCourse: CourseSummary = {
    id: -1,
    title: "默认课程",
    isOngoing: true,
    assignments: []
};
