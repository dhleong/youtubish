import request from "request";

import { ICredentialsManager } from "./creds";

const YOUTUBE_HOST = "https://www.youtube.com";

export class CredsCookieJarManager {

    private cookieJar: request.CookieJar | undefined;

    constructor(
        private readonly creds: ICredentialsManager,
    ) {}

    public async getCookies() {
        const existing = this.cookieJar;
        if (existing) return existing;

        const credentials = await this.creds.get();
        if (!credentials) return;

        const jar = request.jar();

        for (const cookieStr of credentials.cookies.split(/;[ ]*/)) {
            const cookie = request.cookie(cookieStr);
            if (cookie) {
                jar.setCookie(cookie, YOUTUBE_HOST);
            }
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

        const newCookies = jar.getCookieString(YOUTUBE_HOST);
        if (newCookies) {
            this.creds.set({ cookies: newCookies });
        }
    }
}
