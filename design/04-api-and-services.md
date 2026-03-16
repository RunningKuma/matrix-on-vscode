# 04 - API 交互与服务层 (API & Services)

## 1. 服务层架构
服务层位于 `src/services/` 目录下，主要负责与 Matrix 后端服务器进行 HTTP 通信，并将后端复杂多变的数据结构转化为前端易于使用的标准模型。

### `CourseService.ts`
这是最核心的数据服务类，负责处理课程和作业相关的所有 API 请求。
- **主要方法**：
  - `fetchCourses(cookie)`: 获取用户的课程列表。
  - `fetchAssignments(courseId, cookie)`: 获取指定课程的作业列表。
  - `fetchAssignmentDetail(courseId, assignmentId, cookie)`: 获取具体作业的详细内容。
- **数据归一化 (Normalization)**：
  - Matrix 后端 API 返回的数据结构可能存在多种别名或不一致的字段（例如不同的作业类型可能有不同的字段表示状态）。
  - `CourseService` 内部实现了 `normalizeCourses`, `normalizeAssignments` 等私有方法，通过启发式规则（如判断 `isFinished`, `isFullScore`）将原始 payload 映射为 `src/shared.ts` 中定义的 `CourseSummary` 和 `AssignmentSummary` 接口。
  - 这种设计隔离了后端 API 的变化，使得 UI 层代码更加稳定和简洁。
  - 在题目详情归一化阶段，补充了提交链路所需字段：`languageOptions`、`submissionFiles`、`submitLimitation`、`gradeAtEnd`。

### `AuthService.ts`
负责处理用户的登录验证逻辑。
- 提供 `loginWithCookie` 方法，向后端发送请求以验证 Cookie 的有效性，并返回解析后的用户信息。

### `SubmissionService.ts`
负责处理编程题提交与评测查询逻辑。

- **主要方法**：
  - `submitCode(courseId, assignmentId, sourceFiles, cookie)`
  - `fetchSubmissions(courseId, assignmentId, cookie)`
  - `fetchSubmissionDetail(courseId, assignmentId, submissionId, cookie)`
  - `pollSubmissionResult(courseId, assignmentId, cookie, options?)`

- **接口对齐（基于 client 前端实现）**：
  - `POST /api/courses/{courseId}/assignments/{ca_id}/submissions`
  - `GET /api/courses/{courseId}/assignments/{ca_id}/submissions`
  - `GET /api/courses/{courseId}/assignments/{ca_id}/submissions/{sub_ca_id}`

- **提交体规则**：
  - 与前端保持一致，原始提交体使用 `detail.answers` 数组（每项 `{ name, code }`，`code` 为 Base64 编码）。
  - 发送请求时将原始体整体做 `aes-256-gcm` 编码，封装为 `{ encodedBody }` 并携带 `X-Matrix-Encode: aes-256-gcm` 请求头。
  - 对于 `POST` 提交，还需携带 `X-CSRF-Token` 请求头（从 Cookie 中同名项提取），与 Web 前端保持一致。
  - 编程题提交流程不附带 `language` 字段（与现有 Web 前端行为一致）。

- **评测状态判定**：
  - `grade === null` / `grade === -1` / `grade === undefined` 视为“评测中”。
  - 若提交响应提供 `submissionId`，轮询阶段严格匹配该记录。
  - 轮询优先使用 `GET /submissions`，必要时回退到 `GET /submissions/last`。
  - 轮询完成后返回最新提交详情与报告对象；若长时间查不到目标提交则报错中断轮询。

- **报告解析与展示模型**：
  - 优先解析 `report.stages[].cases[]` 结构。
  - 在 UI 层构建“阶段概览 + 数据点详情”两张表，而不是直接渲染原始 JSON。
  - 对 `stdin/stdout/stdout_expect` 的 `data:text/plain;base64,...` 内容做解码与裁剪，便于快速定位错误数据点。

- **业务失败处理**：
  - 除 HTTP 状态码外，还需检查响应体 `status` 字段。
  - 当 `status !== "OK"` 时直接抛出错误并中断轮询，避免“提交失败被误判为提交成功”。

## 2. 数据解码机制
Matrix 后端 API 的一个显著特点是，部分接口的响应体可能会被加密或编码。

### `body-encode.ts`
位于 `src/util/` 目录下，专门用于处理 API 响应的解码。
- **识别加密响应**：`CourseService` 在解析 JSON 后，会检查是否存在 `{ type, body }` 结构的 payload。
- **支持的解码方式**：
  - `aes-256-gcm`: 使用 Node.js 环境提供的 Web Crypto API (`globalThis.crypto`) 进行 AES-256-GCM 解密。
  - `base64`: 使用 `js-base64` 库进行 Base64 解码。
- **无缝集成**：解码过程在 `CourseService.parseResponse` 与 `SubmissionService.parseResponse` 中自动完成，对上层调用者完全透明。

## 3. 网络请求与依赖
- **HTTP 客户端**：项目使用 `node-fetch` (v2 版本) 发起网络请求。选择 v2 版本是为了保持与 CommonJS/Node 环境的良好兼容性，避免 v3 版本的纯 ESM 限制。
- **鉴权方式**：所有受保护的 API 请求均在 HTTP Header 中显式携带 `Cookie` 字段。
- **错误处理**：统一拦截非 2xx 的 HTTP 状态码，并尝试解析后端的错误信息（如“未登录”），抛出标准的 Error 对象供上层 UI 捕获并展示给用户。
