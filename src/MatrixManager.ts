import * as cp from "child_process";
import { EventEmitter } from "events";
import * as vscode from "vscode";

class MatrixManager {
    public static async signIn() {
        const username = await vscode.window.showInputBox({
            prompt: "Enter your Matrix username",
            placeHolder: "e.g., @user:matrix.org"
        });

        try {
        }
        catch (error) {
            vscode.window.showErrorMessage(`Sign-in failed: ${error.message}`);
        }
    }
}
