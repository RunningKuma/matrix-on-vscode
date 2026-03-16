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
        if (userStatus?.isSignedIn === true) {
            return true;
        }

        // 兜底：如果用户状态未及时写入，但 Cookie 已存在，先允许数据层尝试拉取课程。
        return Boolean(globalState.getCookie());
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

            const username = globalState.getUserStatus()?.username;
            vscode.window.showInformationMessage(username ? `登录成功：${username}` : "登录成功");
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
            const username = globalState.getUserStatus()?.username ?? credentials.username;
            vscode.window.showInformationMessage(username ? `登录成功：${username}` : "登录成功");
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

        const username = this.pickUsername(data, fallbackUsername);
        const isSignedIn = this.resolveSignedIn(data, Boolean(cookie));

        await globalState.setUserStatus({
            isSignedIn,
            username
        });
        //感觉globalState存储的东西有点少了...
    }

    private pickUsername(data: any, fallbackUsername?: string): string | null {
        const candidate = this.pickString(
            data?.data?.nickname
            ?? data?.data?.username
            ?? data?.paramData?.user?.username
            ?? data?.paramData?.user?.realname
            ?? fallbackUsername
        );

        return candidate ?? null;
    }

    private resolveSignedIn(data: any, defaultValue: boolean): boolean {
        const message = this.pickString(data?.msg)?.toLowerCase();
        if (message && /(未登录|not\s*login|invalid\s*cookie|cookie.*invalid|expired|登录失效)/.test(message)) {
            return false;
        }

        const status = this.pickString(data?.status)?.toLowerCase();
        if (status) {
            if (/^(ok|success)$/.test(status)) {
                return true;
            }

            if (/(fail|error|unauthorized|forbidden|not\s*login|invalid)/.test(status)) {
                return false;
            }
        }

        return defaultValue;
    }

    private pickString(value: unknown): string | undefined {
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
        return undefined;
    }

    private handleError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`登录失败：${message}`);
    }
}

export const matrixManager = new MatrixManager();
