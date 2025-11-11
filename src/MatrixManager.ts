import * as vscode from "vscode";
import { globalState } from "./globalState";
import { AuthService, type AuthResult } from "./services/AuthService";
import { UIService } from "./services/UIService";

// MatrixManager 负责处理用户的登录和登出逻辑,以后可能还会扩展更多功能
// Leetcode 扩展中有三个大的集中处理类(manager状态管理,channel输出窗口以及executor）
// 本来想仿照写的，但后面发现Executor实际上依赖于leetcode-cli(另一个项目),摸石头过河失败，得改成更简单的设计
class MatrixManager {
    private readonly authService = new AuthService();
    private readonly uiService = new UIService();

    public isSignedIn(): boolean {
        const userStatus = globalState.getUserStatus();
        return userStatus?.isSignedIn === true;
    }

    //signIN 的主逻辑
    public async signIn(): Promise<void> {
        const method = await this.uiService.pickLoginMethod();
        if (!method) {
            return;
        }

        if (method === "CookieLogin") {
            await this.signInWithCookie();
        } else {
            await this.signInWithCredentials();
        }
    }
    public async signOut(): Promise<void> {
        await globalState.clear();
        vscode.window.showInformationMessage("已退出登录");
    }
    
    // Cookie登录
    private async signInWithCookie(): Promise<void> {
        const cookie = await this.uiService.promptForCookie();
        if (!cookie) {
            return;
        }

        try {
            const result = await vscode.window.withProgress<AuthResult>({
                location: vscode.ProgressLocation.Notification,
                title: "正在登录 Matrix..."
            }, () => this.authService.loginWithCookie(cookie));

            const cookieToPersist = this.pickCookie(result.cookies, cookie);
            await this.updateSession(cookieToPersist, result.data);

            vscode.window.showInformationMessage(JSON.stringify(result.data));
            vscode.window.showInformationMessage(JSON.stringify(globalState.getUserStatus()) || "无用户信息");
            vscode.window.showInformationMessage("登录成功");
        } catch (error) {
            this.handleError(error);
        }
    }

    //账密登录，暂时弃用(2025.11.11)
    private async signInWithCredentials(): Promise<void> {
        const credentials = await this.uiService.promptForCredentials();
        if (!credentials) {
            return;
        }

        try {
            const result = await vscode.window.withProgress<AuthResult>({
                location: vscode.ProgressLocation.Notification,
                title: "正在登录 Matrix..."
            }, () => this.authService.loginWithCredentials(credentials.username, credentials.password));

            const cookieToPersist = this.pickCookie(result.cookies);
            await this.updateSession(cookieToPersist, result.data, credentials.username);

            // if(globalState.getUserStatus()?.isVerified == false) {
            //     vscode.window.showInformationMessage("请先完成身份验证");
            //     return;
            // }
            //TODO:还需要完成验证工作，很奇怪好像正常登录也不行...
            //似乎登录需要连着session一起发过去...
            vscode.window.showInformationMessage(JSON.stringify(result.data));
            // vscode.window.showInformationMessage(result.cookies?.toString() || "无 Cookie 信息");
            vscode.window.showInformationMessage("登录成功");
        } catch (error) {
            this.handleError(error);
        }
    }

    //从返回的cookie数组解析出cookie字符串
    //cookie登录时input_cookie和cookies理论上是一样的，但账密登录时只能靠返回的cookie了
    private pickCookie(cookies: string[] | undefined, input_cookie?: string): string | undefined {
        if (cookies && cookies.length > 0) {
            return cookies.join("; ");
        }
        return input_cookie;
    }

    
    private async updateSession(cookie: string | undefined, data: any, fallbackUsername?: string): Promise<void> {
        if (cookie) {
            await globalState.setCookie(cookie);
        }

        //获取用户名和登录状态
        const username = typeof data.data?.nickname === "string" ? data.data.nickname : null;
        const is_signin = typeof data.msg === "string" && data.msg.includes("已登录") ? true : false;

        await globalState.setUserStatus({
            isSignedIn: is_signin,
            username
        });
        //感觉globalState存储的东西有点少了...
    }

    private handleError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`登录失败：${message}`);
    }
}

export const matrixManager = new MatrixManager();