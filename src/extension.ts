// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { matrixManager } from './MatrixManager';
import { globalState } from './globalState';
import { matrixTreeDataProvider } from './sidebar/MatrixTreeDataProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "matrix-on-vscode" is now active!');

	globalState.initialize(context);
	
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('matrix-on-vscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Matrix');

	});

	const showtime = vscode.commands.registerCommand('matrix-on-vscode.showTime', () => {
		//打开提示弹窗显示时间
		const now = new Date();
		const time = now.toLocaleTimeString();
		vscode.window.showInformationMessage(`Current time is: ${time}`);		
	});

	const treeView = vscode.window.createTreeView('matrixExplorerView', {
		treeDataProvider: matrixTreeDataProvider,
		showCollapseAll: true,
	});

	const signInCommand = vscode.commands.registerCommand(
		"matrix-on-vscode.signin",
		async () => {
			await matrixManager.signIn();
			matrixTreeDataProvider.refresh({ force: true });
		}
	);

	const refreshCommand = vscode.commands.registerCommand(
		"matrix-on-vscode.refreshCourses",
		() => matrixTreeDataProvider.refresh({ force: true })
	);

	const refreshAssignmentsCommand = vscode.commands.registerCommand(
		"matrix-on-vscode.refreshCourseAssignments",
		(courseId?: number) => {
			if (typeof courseId === "number") {
				matrixTreeDataProvider.refreshAssignments(courseId);
			} else {
				matrixTreeDataProvider.refreshAssignments();
			}
		}
	);

	context.subscriptions.push(
		disposable,
		showtime,
		signInCommand,
		refreshCommand,
		refreshAssignmentsCommand,
		treeView,
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
