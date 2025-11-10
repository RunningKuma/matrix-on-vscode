export { defaultAssignment, type AssignmentSummary } from "./models/Assignment";
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

//题目类型（怎么这么长）
export interface Assignment {
  ea_id?: number; // exam 专用
  ca_id?: number; // course 专用
  exam_id?: number; // exam
  course_id?: number; // course
  grade_at_end: 0 | 1;
  plcheck: 0 | 1;
  score: number;
  submit_limitation: number;
  adding_time: string;
  lib_id: number;
  prob_id: number;
  ptype_id: number;
  title: string;
  type: string;
  rate: number; // 收藏状态，-1为未收藏，其他值为收藏
  grade: number; // 学生端：题目分数
  role_of_current_course: string; // 学生或教师TA
  total_student: number;
  submit_times: number;
  submit_student_num: number;
  startdate: string;
  enddate: string;
  finished: boolean; // 后端已经可判断题目的完成情况，返回值为boolean
  asgn_id: number;
  standard_score: number;
  pub_answer: 0 | 1;
  config: object;
  author: User;
  files?: any[]; // course program
  notification?: boolean; // 公开课：改题目的提问提醒是否开启（TA/老师）；对于type为private的课，此字段为undefined
  unanswered?: number; // 公开课：该题目未解答的疑问数目（TA/老师）；对于type为private的课，此字段为undefined
}

export interface AssignmentDetail {
  asgn_id: number;
  author: { realname: string; email: string };
  ca_id: number;
  config: any;
  course_id: number;
  description: string;
  enddate: string;
  grade_at_end: 0 | 1;
  is_admin: string;
  plcheck: 0 | 1;
  ptype_id: number;
  pub_answer: 0 | 1;
  standard_score: number;
  startdate: string;
  submit_limitation: number;
  // current_course指的是请求/course或exam/:cid/assignments/:aid时cid对应的课程的用户角色
  // 对于type为private的课程，此属性必不为undefined；对于type为public的课程，此属性在用户没有加入此公开课的时候为空
  role_of_current_course?: string;
  title: string;
  type: string;
  updated_at: string;
  files?: [{ name: string; code: string }]; // 编程题独有
  is_stared: boolean;
  star_rate?: number;
  git_commits?: {
    message: string;
    hexsha: string;
    commited_date: number;
  }[];
  note?: string;
}

*/