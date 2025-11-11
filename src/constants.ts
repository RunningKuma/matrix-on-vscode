export const VIEWS = {
    MATRIX_CONTAINER: "matrixView",
    MATRIX_EXPLORER: "matrixExplorerView"
} as const;

export const CONTEXT_VALUES = {
    CATEGORY_ONGOING: "matrix.category.ongoing",
    CATEGORY_FINISHED: "matrix.category.finished",
    COURSE: "matrix.course",
    ASSIGNMENT_GROUP_PENDING: "matrix.assignmentGroup.pending",
    ASSIGNMENT_GROUP_COMPLETED: "matrix.assignmentGroup.completed",
    ASSIGNMENT: "matrix.assignment",
    INFO: "matrix.info"
} as const;

export const TREE_LABELS = {
    CATEGORY_ONGOING: "进行中的课程",
    CATEGORY_FINISHED: "已结束的课程",
    GROUP_PENDING: "未完成题目",
    GROUP_COMPLETED: "已完成题目"
} as const;

export const BASEURL = {
    STAGING: "https://staging.matrix.moe/",
    PROD: "https://matrix.sysu.edu.cn/"
}