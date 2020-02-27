import cheerio from "cheerio";
import request from "request-promise-native";

import { ICreds } from "../creds";

// tslint:disable-next-line max-line-length
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

export class AngularScraper {

    private identityToken: string | undefined;
    private xsrfToken: string | undefined;

    private cookies: string | undefined;

    constructor(
        private creds?: ICreds,
    ) {}

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
        const headers: any = {
            "User-Agent": USER_AGENT,
        };

        const cookies = await this.getCookies();
        if (cookies) {
            headers.Cookie = cookies;
        }

        return request.get({
            headers,
            url,

            qs: {
                disable_polymer: "true",
            },
        });
    }

    // private async scrapeJson(url: string) {
    //     const headers: any = {
    //         "User-Agent": USER_AGENT,
    //     };
    //
    //     const cookies = await this.getCookies();
    //     if (cookies) {
    //         headers.Cookie = cookies;
    //     }
    //
    //     const html = await request.get({
    //         headers,
    //         url,
    //     });
    //
    //     this.identityToken = extractIdentityToken(html) || this.identityToken;
    //     this.xsrfToken = extractXsrfToken(html) || this.xsrfToken;
    //     return extractJSON(html);
    // }
    //
    // private async loadJson(url: string, opts?: {qs?: {}, form?: {}}) {
    //     const { form, qs } = opts || { qs: undefined, form: undefined };
    //     const fullJson = await request({
    //         form,
    //         headers: {
    //             "Cookie": await this.getCookies(),
    //             "User-Agent": USER_AGENT,
    //             "X-Youtube-Client-Name": 1,
    //             "X-Youtube-Client-Version": "2.20190321",
    //             "X-Youtube-Identity-Token": this.identityToken,
    //         },
    //         json: true,
    //         method: form === undefined ? "GET" : "POST",
    //         qs,
    //         url,
    //     });
    //
    //     if (fullJson.reload === "now") {
    //         return this.scrapeJson(url);
    //     }
    //
    //     return fullJson[1].response;
    // }

    private async getCookies() {
        if (this.cookies) return this.cookies;

        if (this.creds instanceof Promise) {
            const creds = await this.creds;
            this.cookies = creds.cookies;
            return creds.cookies;
        }

        if (this.creds) {
            return this.creds.cookies;
        }
    }
}
