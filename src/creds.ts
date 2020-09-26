import fs from "fs";
import util from "util";

import {
    exchangeRefreshTokenForAccessToken,
    IAccessInfo,
    createCookiesForAccessToken,
} from "./auth";

const readFileAsync = util.promisify(fs.readFile);

export interface ICredentials {
    cookies: string;
}

export function isCredentials(creds: ICreds): creds is ICredentials {
    return (creds as any).cookies;
}

export function isCredentialsPromise(creds: ICreds): creds is Promise<ICredentials> {
    if (!creds) return false;
    return typeof (creds as any).then === "function";
}

export interface ICredentialsManager {
    get(): Promise<ICredentials | undefined>;
    set(credentials: ICredentials): Promise<void>;
}

export class Credentials implements ICredentials {
    constructor(
        public readonly cookies: string,
    ) { }
}

function asyncLambda<T>(value: T) {
    return async () => value;
}

function fileReader(file: string) {
    return () => readFileAsync(file);
}

function curlParser(input: () => Promise<string | Buffer>) {
    return async () => {
        const rawCurl = await input();
        const curlString = rawCurl.toString();

        const m = curlString.match(/'cookie: (.*?)'/);
        if (!m) throw new Error("cookie: not found");

        const [ , cookies ] = m;
        return cookies;
    };
}

export class CredentialsBuilder {
    private _cookies: (() => Promise<string | Buffer>) | undefined;

    public cookies(cookies: string) {
        this._cookies = asyncLambda(cookies);
        return this;
    }

    public cookiesFromFile(file: string) {
        this._cookies = fileReader(file);
        return this;
    }

    public cookiesFromCurl(curlString: string) {
        this._cookies = curlParser(asyncLambda(curlString));
        return this;
    }

    public cookiesFromCurlFile(curlString: string) {
        this._cookies = curlParser(fileReader(curlString));
        return this;
    }

    public async build() {
        if (!this._cookies) throw new Error("No cookies provided");

        const cookies = await this._cookies();
        return new Credentials(cookies.toString());
    }
}

export interface IOauthCredentials {
    refreshToken: string;
    access?: IAccessInfo;
}

export class OauthCredentialsManager implements ICredentialsManager {
    private readonly refreshToken: string;
    private access: IAccessInfo | undefined;

    private runningPromise: Promise<ICredentials> | undefined;

    constructor(
        credentials: IOauthCredentials,
        private readonly options: {
            persistCredentials?: (creds: IOauthCredentials) => Promise<void>,
        } = {},
    ) {
        this.refreshToken = credentials.refreshToken;
        this.access = credentials.access;
    }

    public async get() {
        // ensure we only perform this flow *once* even if we
        // get multiple simultaneous requests

        const running = this.runningPromise;
        if (running) return running;

        const p = this.loadCookies();
        this.runningPromise = p;
        const result = await p;
        this.runningPromise = undefined;

        return result;
    }

    public async set(credentials: ICredentials) {
        // nop
    }

    private async loadCookies() {
        const now = Date.now();

        let access: IAccessInfo;
        if (!this.access || now >= this.access.expiresAt) {
            // get a new access token
            const info = await exchangeRefreshTokenForAccessToken(
                this.refreshToken,
            );
            access = info;
            this.access = info;

            const persist = this.options?.persistCredentials;
            if (persist) {
                await persist({
                    refreshToken: this.refreshToken,
                    access,
                });
            }
        } else {
            // valid access token!
            access = this.access;
        }

        const cookies = await createCookiesForAccessToken(this.access);
        return { cookies };
    }

}

class StaticCredentialsManager implements ICredentialsManager {
    constructor(
        private readonly creds: ICredentials | Promise<ICredentials>,
    ) {}

    public async get() {
        return this.creds;
    }

    public async set(creds: ICredentials) {
        // nop
    }
}

class NopCredentialsManager implements ICredentialsManager {
    public async get() {
        return undefined;
    }

    public async set(creds: ICredentials) {
        // nop
    }
}

class CachingCredentialsManager implements ICredentialsManager {

    private cached: ICredentials | undefined;
    private expiration = 0;

    constructor(
        private readonly delegate: ICredentialsManager,
    ) {}

    public async get() {
        const now = Date.now();
        if (this.cached && now < this.expiration) {
            return this.cached;
        }

        const creds = await this.delegate.get();
        this.cached = creds;

        // cookies are typically valid for a week or so, but let's
        // refresh more often just in case
        this.expiration = now + 24 * 3600 * 1000;

        return creds;
    }

    public async set(creds: ICredentials) {
        this.cached = creds;
        return this.delegate.set(creds);
    }
}

export function asCredentialsManager(creds: ICreds | undefined): ICredentialsManager {
    if (!creds) return new NopCredentialsManager();
    if (isCredentials(creds) || isCredentialsPromise(creds)) {
        return new StaticCredentialsManager(creds);
    }
    return creds;
}

export function cached(credentialsManager: ICredentialsManager): ICredentialsManager {
    if (
        credentialsManager instanceof CachingCredentialsManager
        || credentialsManager instanceof NopCredentialsManager
    ) {
        return credentialsManager;
    }

    return new CachingCredentialsManager(credentialsManager);
}

export function asCachedCredentialsManager(creds: ICreds | undefined): ICredentialsManager {
    return cached(asCredentialsManager(creds));
}

export type ICreds = ICredentials | Promise<ICredentials> | ICredentialsManager;
