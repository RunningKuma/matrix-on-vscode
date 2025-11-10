// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { COMMANDS, VIEWS } from "./constants";
import { matrixManager } from "./MatrixManager";
import { globalState } from "./globalState";
import { matrixTreeDataProvider } from "./sidebar/MatrixTreeDataProvider";
import { previewAssignment } from "./webview/assignmentPreview";
import { type AssignmentSummary } from "./shared";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext): void {
	console.log('Congratulations, your extension "matrix-on-vscode" is now active!');

	globalState.initialize(context);

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMANDS.HELLO_WORLD, () => {
			vscode.window.showInformationMessage("Hello World from Matrix");
		}),
		vscode.commands.registerCommand(COMMANDS.SHOW_TIME, () => {
			const now = new Date();
			const time = now.toLocaleTimeString();
			vscode.window.showInformationMessage(`Current time is: ${time}`);
		}),
		vscode.commands.registerCommand(COMMANDS.SIGN_IN, async () => {
			await matrixManager.signIn();
			matrixTreeDataProvider.refresh({ force: true });
		}),
		vscode.commands.registerCommand(COMMANDS.REFRESH_COURSES, () => {
			matrixTreeDataProvider.refresh({ force: true });
		}),
		vscode.commands.registerCommand(COMMANDS.REFRESH_ASSIGNMENTS, (courseId?: number) => {
			if (typeof courseId === "number") {
				matrixTreeDataProvider.refreshAssignments(courseId);
			} else {
				matrixTreeDataProvider.refreshAssignments();
			}
		}),
		vscode.commands.registerCommand(COMMANDS.PREVIEW_PROBLEM, async (assignment?: AssignmentSummary) => {
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
