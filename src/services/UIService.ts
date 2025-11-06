import * as vscode from "vscode";

export type LoginMethod = "CookieLogin" | "UserLogin";

export interface CredentialsInput {
    username: string;
    password: string;
    captcha?: string;
}

export class UIService {
    public async pickLoginMethod(): Promise<LoginMethod | undefined> {
        const items: vscode.QuickPickItem[] = [
            {
                label: "通过用户名登录",
                detail: "使用 Matrix 用户名进行登录",
                description: "UserLogin"
            },
            {
                label: "通过 Cookie 登录",
                detail: "使用 Matrix Cookie 进行登录",
                description: "CookieLogin"
            }
        ];

        const choice = await vscode.window.showQuickPick(items, {
            placeHolder: "选择登录方式"
        });

        return choice?.description as LoginMethod | undefined;
    }

    public async promptForCookie(): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt: "请输入你的 Matrix Cookie",
            password: true,
            ignoreFocusOut: true,
            validateInput: value => (value ? undefined : "Cookie 不能为空")
        });
    }

    public async promptForCredentials(): Promise<CredentialsInput | undefined> {
        const username = await vscode.window.showInputBox({
            prompt: "请输入用户名",
            ignoreFocusOut: true,
            validateInput: value => (value ? undefined : "用户名不能为空")
        });
        if (!username) {
            return undefined;
        }

        const password = await vscode.window.showInputBox({
            prompt: "请输入密码",
            password: true,
            ignoreFocusOut: true,
            validateInput: value => (value ? undefined : "密码不能为空")
        });
        if (!password) {
            return undefined;
        }

        const captcha = await vscode.window.showInputBox({
            prompt: "请输入验证码（如无可留空）",
            ignoreFocusOut: true
        });

        return { username, password, captcha: captcha || undefined };
    }
}
