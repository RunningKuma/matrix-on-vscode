# 03 - 界面与树形视图设计 (UI & TreeView Design)

## 1. 侧边栏树形视图 (TreeView)
扩展在 VS Code 的活动栏中注册了一个名为 `Matrix` 的视图容器，并在其中展示课程和作业的层级结构。

### 核心类：`MatrixTreeDataProvider`
实现了 `vscode.TreeDataProvider<MatrixNode>` 接口，负责为 TreeView 提供数据和节点层级关系。

### 节点层级设计 (`MatrixNode.ts`)
视图采用了多级树状结构，节点类型均继承自基类 `MatrixNode`（继承自 `vscode.TreeItem`）：
1. **`CategoryNode` (根节点)**
   - 分为“进行中的课程” (Ongoing) 和“已结束的课程” (Finished)。
2. **`CourseNode` (课程节点)**
   - 展示具体的课程名称。展开后加载该课程的作业分组。
3. **`AssignmentGroupNode` (作业分组节点)**
   - 将作业分为“未完成题目” (Pending) 和“已完成题目” (Completed)。
4. **`AssignmentNode` (作业节点)**
   - 叶子节点，展示具体的作业标题。
   - 绑定了 `matrix-on-vscode.previewProblem` 命令，点击即可在右侧打开预览面板。
5. **`InfoNode` (信息/占位节点)**
   - 用于在特殊状态下展示提示信息，如“正在加载...”、“加载失败，点击重试”、“未登录，点击登录”等。支持绑定特定的命令和图标（`ThemeIcon`）。

### 缓存与刷新机制
- **全局刷新**：`refresh({ force: true })` 会清空所有课程和作业的缓存，重新从服务器拉取数据。
- **局部刷新**：`refreshAssignments(courseId)` 仅使特定课程的作业缓存失效，优化了网络请求频率和 UI 响应速度。
- **状态反馈**：在请求数据期间，通过返回 `InfoNode` 展示加载状态，避免 UI 阻塞。

## 2. 作业预览面板 (Webview)
当用户点击具体的作业节点时，会触发作业预览功能。

### 核心实现：`src/webview/assignmentPreview.ts`
- **数据获取**：调用 `CourseService.fetchAssignmentDetail()` 获取包含题目描述、状态、分数、截止时间等详细信息的对象。
- **Markdown 转换**：将获取到的详情数据拼接组装为 Markdown 格式的字符串。
- **HTML 渲染**：利用 VS Code 内置的 `markdown.api.render` 命令，将 Markdown 转换为安全的 HTML。
- **Webview 管理**：
  - 使用 `vscode.window.createWebviewPanel` 创建面板。
  - 维护了一个 `previewPanels` Map 缓存，键为 `${courseId}:${assignmentId}`。如果用户重复点击同一题目，会直接 `reveal` 已有的面板，而不是重复创建。
  - 面板关闭时，通过 `onDidDispose` 事件监听器清理缓存。
