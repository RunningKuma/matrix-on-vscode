# 01 - 项目架构总览 (Architecture Overview)

## 1. 项目简介
Matrix on VS Code 是一个用于在 Visual Studio Code 中查看和管理 Matrix 课程与作业的扩展插件。它允许用户直接在编辑器中浏览课程、查看作业状态、预览作业详情，并在扩展内完成编程题提交与评测结果查看。

## 2. 核心模块划分
项目采用了模块化的设计，主要分为以下几个核心部分：

- **入口与注册 (Entrypoint)**
  - 文件：`src/extension.ts`
  - 职责：扩展的激活入口，负责初始化全局状态、注册 VS Code 命令（如登录、登出、刷新、预览、提交代码等），以及创建和绑定侧边栏的 TreeView 视图。

- **状态与会话管理 (State & Auth)**
  - 文件：`src/MatrixManager.ts`, `src/globalState.ts`
  - 职责：`MatrixManager` 负责统筹用户的登录和登出流程；`globalState` 封装了 VS Code 的 `Memento` API，用于持久化存储用户的 Cookie 和基本状态信息。

- **服务层 (Services)**
  - 目录：`src/services/`
  - 职责：封装与 Matrix 后端 API 的交互逻辑。
    - `AuthService.ts`: 处理登录验证。
    - `CourseService.ts`: 获取课程列表、作业列表及作业详情，并负责数据的归一化处理。
    - `SubmissionService.ts`: 处理编程题提交、提交历史查询、单次提交详情查询、评测轮询。
    - `UIService.ts`: 封装 VS Code 的用户交互 UI（如输入框、下拉选择等）。

- **UI 与视图 (UI & Views)**
  - 目录：`src/sidebar/`, `src/webview/`
  - 职责：
    - `sidebar/`: 实现了 VS Code 的 TreeView（侧边栏树形视图），包括数据提供者 `MatrixTreeDataProvider` 和各类节点定义 `MatrixNode`。
    - `webview/assignmentPreview.ts`: 作业详情预览面板，支持从预览页跳转“提交代码”。
    - `webview/submissionPanel.ts`: 可交互提交面板，负责代码输入、提交、轮询状态和结果展示。

- **数据模型与工具 (Models & Utils)**
  - 目录：`src/models/`, `src/util/`, `src/shared.ts`
  - 职责：定义前后端交互的数据结构（如 `Course`, `Assignment`），以及提供通用的工具函数（如 API 响应体的 AES/Base64 解码工具 `body-encode.ts`）。

## 3. 数据流向与交互
1. **用户操作**：用户在侧边栏点击刷新或展开节点。
2. **触发请求**：`MatrixTreeDataProvider` 调用 `CourseService` 发起网络请求。
3. **数据处理**：`CourseService` 携带 `globalState` 中的 Cookie 请求 API，若响应加密则调用 `body-encode.ts` 解密，随后将复杂的数据结构归一化为标准模型。
4. **视图更新**：数据返回后，更新 TreeView 的内部缓存，并触发视图重绘。
5. **作业预览**：用户点击具体作业节点，触发 `previewProblem` 命令，调用 `assignmentPreview.ts` 获取详情并渲染 Webview 面板。
6. **提交评测**：用户在题目节点右键或题目预览页点击“提交代码”，触发 `submitCode` 命令，进入 `submissionPanel.ts`，再由 `SubmissionService` 调用提交/查询接口并回写结果到 Webview。
