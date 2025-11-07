import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
// import { leetCodeManager } from "../leetCodeManager";
// import { Category, defaultProblem, ProblemState } from "../shared";
// import { explorerNodeManager } from "./explorerNodeManager";
// import { LeetCodeNode } from "./LeetCodeNode";
import { globalState } from "../globalState";
import { matrixManager } from "../MatrixManager";
import { MatrixNode } from "./MatrixNode";


//TODO: 实现侧边栏数据提供：
// 1. 规定好数据结构 MatrixNode
// 2. 实现 MatrixTreeDataProvider 类，继承 vscode.TreeDataProvider<MatrixNode>
// 3. 在 extension.ts 中注册 TreeDataProvider
export class MatrixTreeDataProvider implements vscode.TreeDataProvider<MatrixNode> {
   public getTreeItem(element: MatrixNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        // throw new Error("Method not implemented.");
        if (!globalState.getUserStatus()?.isSignedIn) {
            return {
                label: "未登录 Matrix",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    title: "登录 Matrix",
                    command: "matrix.signIn"
                }
            };
        }  
        return element;  
    }
    public getChildren(element?: MatrixNode | undefined): vscode.ProviderResult<MatrixNode[]> {
        throw new Error("Method not implemented.");
    }
}

export const matrixTreeDataProvider = new MatrixTreeDataProvider();