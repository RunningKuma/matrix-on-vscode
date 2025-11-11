import fetch, { Response } from "node-fetch";
import { encodeBody, decodeBody } from "../util/body-encode";
import { BASEURL } from "../constants";

export interface AuthResult<TData = unknown> {
    data: TData | undefined;
    cookies: string[];
}


export class AuthService {
    private readonly baseUrl: string;

    public constructor(baseUrl: string = BASEURL.PROD) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }
    
    //使用账号密码登录，返回数据和cookie，暂时弃用（25.11.11）
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
    
     // 将返回的信息拆解成为data和cookie    
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
    
    //解析返回的body
    //总感觉有点奇怪，像是多此一举
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

    //从响应头中提取cookie
    private extractCookies(response: Response): string[] {
        const headers = response.headers as unknown as { raw?: () => Record<string, string[]> };
        const rawCookies = headers.raw?.()["set-cookie"];
        if (!rawCookies || rawCookies.length === 0) {
            return [];
        }

        return rawCookies;
    }
}
