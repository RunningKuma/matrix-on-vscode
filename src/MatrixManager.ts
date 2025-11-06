import * as vscode from "vscode";
import { globalState } from "./globalState";
import { AuthService, type AuthResult } from "./services/AuthService";
import { UIService } from "./services/UIService";

class MatrixManager {
    private readonly authService = new AuthService();
    private readonly uiService = new UIService();

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

            vscode.window.showInformationMessage("登录成功");
        } catch (error) {
            this.handleError(error);
        }
    }

    private async signInWithCredentials(): Promise<void> {
        const credentials = await this.uiService.promptForCredentials();
        if (!credentials) {
            return;
        }

        try {
            const result = await vscode.window.withProgress<AuthResult>({
                location: vscode.ProgressLocation.Notification,
                title: "正在登录 Matrix..."
            }, () => this.authService.loginWithCredentials(credentials.username, credentials.password, credentials.captcha));

            const cookieToPersist = this.pickCookie(result.cookies);
            await this.updateSession(cookieToPersist, result.data, credentials.username);

            if(globalState.getUserStatus()?.isVerified == false) {
                vscode.window.showInformationMessage("请先完成身份验证");
                return;
            }
            //TODO:还需要完成验证工作，很奇怪好像正常登录也不行...
            //似乎登录需要连着session一起发过去...
            // vscode.window.showInformationMessage(JSON.stringify(result.data));
            vscode.window.showInformationMessage("登录成功");
        } catch (error) {
            this.handleError(error);
        }
    }

    private pickCookie(cookies: string[] | undefined, fallback?: string): string | undefined {
        if (cookies && cookies.length > 0) {
            return cookies[0];
        }

        return fallback;
    }

    private async updateSession(cookie: string | undefined, data: any, fallbackUsername?: string): Promise<void> {
        if (cookie) {
            await globalState.setCookie(cookie);
        }

        const username = typeof data?.username === "string" ? data.username : fallbackUsername ?? null;
        const isVerified = typeof data?.isVerified === "boolean" ? data.isVerified : undefined;

        await globalState.setUserStatus({
            isSignedIn: true,
            username,
            isVerified
        });
    }

    private handleError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`登录失败：${message}`);
    }
}

export const matrixManager = new MatrixManager();