import * as vscode from 'vscode';

const CookieKey = 'matrix_cookie';
const UserStatusKey = 'matrix_user_status';

export type UserDataType = {
    isSignedIn: boolean;
    username: string | null;
    isVerified?: boolean;
}

class GlobalState {
    private context!: vscode.ExtensionContext;
    private _state!: vscode.Memento;
    private _cookie: string | undefined;
    private _userStatus: UserDataType | undefined;


    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this._state = this.context.globalState;
    }
    public setCookie(cookie: string): any {
        this._cookie = cookie;
        return this._state.update(CookieKey, cookie);
    }
    public getCookie(): string | undefined {
        return this._cookie ?? this._state.get<string>(CookieKey);
    }

    public setUserStatus(data: UserDataType): any {
        this._userStatus = data;
        return this._state.update(UserStatusKey, this._userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        return this._userStatus ?? this._state.get<UserDataType>(UserStatusKey);
    }

    public removeCookie(): any {
        return this._state.update(CookieKey, undefined);
    }

    public removeUserStatus(): any {
        return this._state.update(UserStatusKey, undefined);
    }
    
    public clear(): any {  
        this._state.update(CookieKey, undefined);
        this._state.update(UserStatusKey, undefined);
    }

}

export const globalState = new GlobalState();