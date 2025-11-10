export { defaultAssignment, type AssignmentSummary, type AssignmentDetail, type AssignmentAttachment } from "./models/Assignment";
export { defaultCourse, type CourseSummary } from "./models/Course";

/*一些从client和course薅下来的类型，可以参考

export interface CourseBase {
  course_id: number;
  name?: string;
  course_name?: string;
}

export enum CourseType {
  PRIVATE = 'private',
  PUBLIC = 'public'
}

//  单个课程信息
export interface Course extends CourseBase {
  creator: User;
  progressing_num: number; // 表示课程下当前开放做题的问题数量。对于公开课：由于公开课的题目没有特定截止时间，所以这一项也是公开课的题目总数
  unfinished_num: number; // 公开课未完成的题目数量（学生）
  student_num: number;
  role?: CourseRole;
  school_year: string;
  semester: string;
  status: CourseStatus;
  teacher: string;
  term: string;
  description: string;
  type: CourseType;
  notification?: boolean; // 公开课课程的提问提醒是否开启（TA/老师）
  unanswered?: number; // 公开课课程未解答的疑问数目（TA/老师）
  unaccessible_reason?: string;
  accessible_when_close: boolean;
  ip_binding?: boolean;
  related_libraries?: Library[];
  note_date: string;
  note_count: number;
  is_video: boolean; // 表示是否为视频公开课
  cover: string; // 视频公开课的封面图片url
  is_datum_hidden: boolean;
}


*/