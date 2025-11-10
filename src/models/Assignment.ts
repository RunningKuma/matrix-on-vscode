export interface AssignmentSummary {
    id: number;
    courseId: number;
    title: string;
    startAt?: string;
    deadline?: string;
    status?: string;
    score?: number;
    maxScore?: number;
    submitTimes?: number;
    isFinished: boolean;
    isFullScore: boolean;
    raw?: unknown;
}

export const defaultAssignment: AssignmentSummary = {
    id: -1,
    courseId: -1,
    title: "默认题目",
    isFinished: false,
    isFullScore: false
};

