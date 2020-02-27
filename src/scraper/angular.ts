import cheerio from "cheerio";
import request from "request-promise-native";

import { CredsCookieJarManager } from "../cookie-jar";
import { asCachedCredentialsManager, ICredentialsManager, ICreds } from "../creds";

// tslint:disable-next-line max-line-length
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

const YOUTUBE_HOST = "https://www.youtube.com";

export class AngularScraper {

    private readonly cookies: CredsCookieJarManager;

    constructor(
        creds?: ICreds,
    ) {
        this.cookies = new CredsCookieJarManager(
            asCachedCredentialsManager(creds),
        );
    }

    public async scrape(url: string) {
        const html = await this.fetch(url);

        return cheerio.load(html);
    }

    public async scrapeContinuation(
        url: string,
        contentElement: string,
        contentId?: string,
    ) {
        const raw = await this.fetch(url);
        const json = JSON.parse(raw);
        const { content_html, load_more_widget_html } = json;
        const html = `
            <div>
            <${contentElement} class="content" id="${contentId}">
                ${content_html}
            </${contentElement}>
            ${load_more_widget_html}
            </div>
        `;

        return cheerio.load(html);
    }

    private async fetch(url: string) {
        const html = await request.get({
            headers: {
                "User-Agent": USER_AGENT,
            },
            jar: await this.cookies.getCookies(),
            url,

            qs: {
                disable_polymer: "true",
            },
        });

        await this.cookies.updateCookies();

        return html;
    }

}
