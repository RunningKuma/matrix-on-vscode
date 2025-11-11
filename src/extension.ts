// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { VIEWS } from "./constants";
import { matrixManager } from "./MatrixManager";
import { globalState } from "./globalState";
import { matrixTreeDataProvider } from "./sidebar/MatrixTreeDataProvider";
import { previewAssignment } from "./webview/assignmentPreview";
import { type AssignmentSummary } from "./shared";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext): void {
	console.log('Congratulations, your extension "matrix-on-vscode" is now active!');

	globalState.initialize(context);

	//这里是在注册命令和视图，可以在package.json中看到对应的配置
	context.subscriptions.push(
		vscode.commands.registerCommand("matrix-on-vscode.helloWorld", () => {
			vscode.window.showInformationMessage("Hello World from Matrix");
		}),
		vscode.commands.registerCommand("matrix-on-vscode.showTime", () => {
			const now = new Date();
			const time = now.toLocaleTimeString();
			vscode.window.showInformationMessage(`Current time is: ${time}`);
		}),
		vscode.commands.registerCommand("matrix-on-vscode.signin", async () => {
			await matrixManager.signIn();
			matrixTreeDataProvider.refresh({ force: true });
		}),
		vscode.commands.registerCommand("matrix-on-vscode.refreshCourses", () => {
			matrixTreeDataProvider.refresh({ force: true });
		}),
		vscode.commands.registerCommand("matrix-on-vscode.signout", async () => {
			await matrixManager.signOut();
			matrixTreeDataProvider.refresh({ force: true });
			vscode.window.showInformationMessage("已退出登录");
		}),
		vscode.commands.registerCommand("matrix-on-vscode.refreshCourseAssignments", (courseId?: number) => {
			if (typeof courseId === "number") {
				matrixTreeDataProvider.refreshAssignments(courseId);
			} else {
				matrixTreeDataProvider.refreshAssignments();
			}
		}),
		vscode.commands.registerCommand("matrix-on-vscode.previewProblem", async (assignment?: AssignmentSummary) => {
			await previewAssignment(context, assignment);
		}),
		vscode.window.createTreeView(VIEWS.MATRIX_EXPLORER, {
			treeDataProvider: matrixTreeDataProvider,
			showCollapseAll: true
		})
		
	);
}

// This method is called when your extension is deactivated
export function deactivate(): void {}
