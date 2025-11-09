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
import { defaultCourse } from "../shared";


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
    
    getChildren(element?: MatrixNode | undefined): vscode.ProviderResult<MatrixNode[]> {
        if (!matrixManager.isSignedIn()) {
            return [ //实际这里应该还需要定好数据结构之类的
            new MatrixNode(
                Object.assign({}, defaultCourse, {
                    course_id: -1,
                    title: "请先登录 Matrix",
                }),
                false
            ),
        ];
    }
}
}

export const matrixTreeDataProvider = new MatrixTreeDataProvider();