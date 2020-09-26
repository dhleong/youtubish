import { CookieJar } from "tough-cookie";

import { ICredentialsManager } from "./creds";

const YOUTUBE_HOST = "https://www.youtube.com";

export class CredsCookieJarManager {

    private cookieJar: CookieJar | undefined;

    constructor(
        private readonly creds: ICredentialsManager,
    ) {}

    public async getCookies() {
        const existing = this.cookieJar;
        if (existing) return existing;

        const credentials = await this.creds.get();
        if (!credentials) return;

        const jar = new CookieJar();

        for (const cookieStr of credentials.cookies.split(/;[ ]*/)) {
            jar.setCookie(cookieStr, YOUTUBE_HOST);
        }

        return jar;
    }

    /**
     * This method to be called after a completed request
     * to write any updated cookies back to the ICredentialsManager
     */
    public async updateCookies() {
        const jar = this.cookieJar;
        if (!jar) return;

        const newCookies = await jar.getCookieString(YOUTUBE_HOST);
        if (newCookies) {
            this.creds.set({ cookies: newCookies });
        }
    }
}
