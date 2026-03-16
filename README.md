# Matrix on VS Code

在 VS Code 侧边栏中查看 Matrix 课程与作业，支持 Cookie 登录、课程/题目树形浏览和作业详情预览。

## 功能

- Matrix 账号 Cookie 登录
- 课程按「进行中 / 已结束」分组显示
- 题目按「未完成 / 已完成」分组显示
- 题目详情预览（Markdown 渲染 + 附件展示）
- 编程题提交（代码输入、提交评测、结果轮询）
- 课程和题目局部刷新

## 本地开发

### 环境

- Node.js 20+
- pnpm
- VS Code 1.99+

### 安装依赖

```bash
pnpm install
```

### 编译

```bash
pnpm run compile
```

### 调试扩展

1. 在此项目中按 `F5` 启动 `Run Extension`。
2. 在新开的 Extension Host 窗口中打开 Matrix 侧边栏。
3. 点击登录节点并输入 Cookie。

## 常用命令

- `matrix-on-vscode.signin`: 登录
- `matrix-on-vscode.signout`: 登出
- `matrix-on-vscode.refreshCourses`: 刷新课程
- `matrix-on-vscode.refreshCourseAssignments`: 刷新某课程题目
- `matrix-on-vscode.previewProblem`: 预览题目
- `matrix-on-vscode.submitCode`: 打开提交面板并提交评测

## 项目结构

- `src/extension.ts`: 扩展入口与命令注册
- `src/MatrixManager.ts`: 登录/登出流程编排
- `src/services/`: API 请求与数据归一化
- `src/sidebar/`: TreeView 节点与数据提供
- `src/webview/`: 题目预览面板
- `design/`: 架构与模块设计文档

## 测试与检查

```bash
pnpm run check-types
pnpm run lint
pnpm run compile-tests
```
