# 02 - 认证与状态管理 (Auth & State Management)

## 1. 认证流程设计
Matrix on VS Code 目前主要依赖 **Cookie 登录** 方式来获取用户授权。虽然代码中保留了账号密码登录的逻辑，但由于后端验证机制的限制，目前已被标记为不推荐或暂弃用。

### 登录时序
1. 用户触发 `matrix-on-vscode.signin` 命令。
2. `MatrixManager.signIn()` 被调用，通过 `UIService` 弹出选项让用户选择登录方式（默认 Cookie）。
3. 用户输入 Cookie 字符串。
4. `MatrixManager` 调用 `AuthService.loginWithCookie(cookie)`，向后端 `/api/users/login` 发送 GET 请求以验证 Cookie 的有效性。
5. 验证成功后，后端返回用户信息。`MatrixManager` 将有效的 Cookie 和用户状态（如 `isSignedIn`）传递给 `globalState` 进行持久化保存。
6. 触发 TreeView 刷新，展示用户的课程数据。

### 登录态判定策略（稳定性修复）
- 登录成功后，不再仅依赖后端 `msg` 文案判断是否已登录。
- `MatrixManager.updateSession()` 会综合 `status`、`msg` 与 Cookie 是否存在来写入 `isSignedIn`。
- `MatrixManager.isSignedIn()` 增加 Cookie 兜底判断，避免“登录成功但状态尚未同步”导致侧边栏误显示未登录。

## 2. 状态管理 (Global State)
状态管理由 `src/globalState.ts` 负责，它封装了 VS Code 提供的 `ExtensionContext.globalState` (基于 `Memento` 接口)。

### 存储的数据
- **`matrix_cookie`**: 用户的身份凭证，用于后续所有需要鉴权的 API 请求。
- **`matrix_user_status`**: 用户的基本信息和状态（如是否已登录）。

### 核心方法
- `initialize(context)`: 在扩展激活时调用，注入 VS Code 的上下文。
- `getCookie()` / `setCookie()`: 获取和设置 Cookie。
- `getUserStatus()` / `setUserStatus()`: 获取和设置用户状态。
- `clear()`: 清除所有存储的认证信息，将用户状态重置为未登录。

### 设计原则
- **集中读取**：其他模块（如 `CourseService`, `assignmentPreview`）在需要鉴权时，统一通过 `globalState.getCookie()` 获取凭证，而不是自行维护状态。
- **安全与隔离**：利用 VS Code 的内置存储机制，确保凭证数据仅在当前扩展上下文中有效。
- **容错优先**：展示层登录判定允许使用 Cookie 兜底，真实鉴权结果仍以后端接口返回为准（失效时由服务层触发重新登录引导）。

## 3. 登出与异常处理
- **主动登出**：用户触发 `signout` 命令，`MatrixManager.signOut()` 调用 `globalState.clear()`，并刷新视图显示“未登录”提示。
- **被动登出（Token 失效）**：当 `CourseService` 发起请求遇到鉴权失败（如返回“未登录”错误）时，会抛出异常，上层捕获后可引导用户重新登录。
