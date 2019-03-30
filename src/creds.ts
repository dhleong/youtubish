import fs from "fs";
import util from "util";

const readFileAsync = util.promisify(fs.readFile);

export interface ICredentials {
    cookies: string;
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

export type ICreds = ICredentials | Promise<ICredentials>;
