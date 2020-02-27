import fs from "fs";
import util from "util";

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

    constructor(
        private readonly delegate: ICredentialsManager,
    ) {}

    public async get() {
        if (this.cached) return this.cached;

        const creds = await this.delegate.get();
        this.cached = creds;
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
