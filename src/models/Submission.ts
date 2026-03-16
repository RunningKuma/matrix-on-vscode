export interface SourceFileForSubmission {
    name: string;
    content: string;
}

export interface SubmitCodeResult {
    submissionId?: number;
    sign?: string;
    raw?: unknown;
}

export interface SubmissionSummary {
    id: number;
    submittedAt?: string;
    grade?: number | null;
    raw?: unknown;
}

export interface SubmissionDetail extends SubmissionSummary {
    answers?: Array<{ name: string; code: string }>;
    report?: unknown;
}

export interface PollSubmissionProgress {
    attempt: number;
    elapsedMs: number;
    latest?: SubmissionSummary;
    detail?: SubmissionDetail;
}

export interface PollSubmissionResult {
    timeout: boolean;
    attempts: number;
    elapsedMs: number;
    latest?: SubmissionSummary;
    detail?: SubmissionDetail;
}

