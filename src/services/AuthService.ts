import fetch, { type Response } from "node-fetch";
import { encodeBody, decodeBody } from "../util/body-encode";
export interface AuthResult<TData = unknown> {
    data: TData | undefined;
    cookies: string[];
}

export interface UserData {
    //TODO: 设置用户数据结构
}




export class AuthService {
    private readonly baseUrl: string;

    public constructor(baseUrl: string = "https://matrix.sysu.edu.cn") {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    public async loginWithCredentials(username: string, password: string): Promise<AuthResult> {
        const res_for_cookie: Response = await fetch(`${this.baseUrl}/api/users/login`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });
        const cookies: string[] = this.extractCookies(res_for_cookie);
         

        const encodedBody = await encodeBody("aes-256-gcm", { username, password });
        const response = await fetch(`${this.baseUrl}/api/users/login`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                // Cookie: cookies.join("; ")
            },
            body: encodedBody ?? undefined,
        });

        return this.handleResponse(response);
    }

    public async loginWithCookie(cookie: string): Promise<AuthResult> {
        const response = await fetch(`${this.baseUrl}/api/users/login`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie
            }
        });

        return this.handleResponse(response);
    }

    private async handleResponse(response: Response): Promise<AuthResult> {
        const rawText = await response.text();
        if (!response.ok) {
            throw new Error(rawText || `请求失败：${response.status}`);
        }

        const data = this.parseBody(rawText);
        return {
            data,
            cookies: this.extractCookies(response)
        };
    }

    private parseBody(rawText: string): any {
        if (!rawText) {
            return undefined;
        }

        try {
            return JSON.parse(rawText);
        } catch (error) {
            return rawText;
        }
    }

    private extractCookies(response: Response): string[] {
        const headers = response.headers as unknown as { raw?: () => Record<string, string[]> };
        const rawCookies = headers.raw?.()["set-cookie"];
        if (!rawCookies || rawCookies.length === 0) {
            return [];
        }

        return rawCookies;
    }
}
