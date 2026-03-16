# 本轮进展日志（提交评测功能）

## 2026-03-16

### 已完成

- 基于 `client/` 前端实现完成接口对齐，确认提交流程主接口：
  - `POST /api/courses/{courseId}/assignments/{ca_id}/submissions`
  - `GET /api/courses/{courseId}/assignments/{ca_id}/submissions`
  - `GET /api/courses/{courseId}/assignments/{ca_id}/submissions/{sub_ca_id}`
- 在扩展侧新增 `SubmissionService`，实现代码提交、提交记录查询、单次提交详情查询、轮询评测结果。
- 新增 `matrix-on-vscode.submitCode` 命令，并在题目节点右键菜单接入“提交代码”入口。
- 新增提交 Webview（语言选择、文件名、代码输入、提交按钮、状态日志、结果展示）。
- 题目预览页新增“提交代码”按钮（command URI），支持从详情页直接跳转提交流程。
- `CourseService` 题目详情补齐提交相关字段归一化：`languageOptions`、`submissionFiles`、`submitLimitation`、`gradeAtEnd`。
- 修复“提交后持续轮询但无提交记录”问题：
  - 对齐 `client` 行为，提交请求改为 `aes-256-gcm` 编码并携带 `X-Matrix-Encode` 头。
  - POST 请求补齐 `X-CSRF-Token` 头（从 Cookie 中提取），对齐 Web 前端拦截器行为。
  - 对提交/查询接口增加业务状态校验（`status !== OK` 直接报错，不再误判成功后盲轮询）。
  - 提交体不再附带 `language` 字段，保持与 Web 前端一致。
  - 轮询目标改为“严格匹配指定 submissionId”，若长期找不到目标记录则主动报错终止轮询。
  - 轮询阶段增加 `/submissions/last` 回退查询，兼容提交列表接口延迟/差异返回。
- 提交结果展示升级：
  - 隐藏原始 report JSON 文本。
  - 新增“阶段概览”表格（阶段/状态/得分/Case 数）。
  - 新增“数据点详情”表格（阶段、Case、状态、耗时、内存、描述、输入、输出、期望输出）。
  - 支持解析 `stages[].cases[]` 结构，并对 data URL 的 Base64 文本做解码与裁剪展示。
- 修复登录后侧边栏偶发不刷新课程的问题：
  - 登录态判定不再依赖 `msg.includes("已登录")`，改为 `status/msg + cookie` 的稳健判定策略。
  - `matrixManager.isSignedIn()` 增加 Cookie 兜底，避免状态写入时序导致 TreeView 误判未登录。
  - 移除登录成功时的调试弹窗，仅保留简洁成功提示。
- 完成基础验证：
  - `pnpm run check-types`
  - `pnpm run lint`
  - `pnpm run compile`

### 当前阻塞

- 暂无代码级阻塞；后续需要真实账号联调以确认所有评测报告结构分支（例如 `StandardCheck`/`GTest` 细节）。

### 下一步

1. 使用真实课程题目执行端到端回归（成功、编译失败、运行失败、超时）。
2. 根据联调返回补充 verdict 映射和报告摘要逻辑。
3. 增加 `SubmissionService` 的单元测试覆盖（状态轮询与错误分支）。

## 2026-03-07

### 已完成

- 建立 `current/` 目录下的本轮文档基线。
- 完成“本地编写与提交评测功能”首轮综合评估。
- 输出必需资料与 API 清单。
- 给出分阶段开发思路（A~D）与 MVP 验收标准。

### 当前阻塞

- 缺少提交与评测相关的后端接口定义与样例响应。

### 下一步

1. 获取提交/查询结果 API 的真实路径、请求体、响应体样例。
2. 确认语言映射与提交限制规则。
3. 在此目录追加接口对齐记录并进入实现阶段。
