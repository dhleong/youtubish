import request from "request-promise-native";

import { ICreds } from "../creds";
import { IPolymerScrapingContinuation } from "../iterable/polymer";

// using this agent triggers Google to return some JSON we can consume
// tslint:disable-next-line max-line-length
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

const CONTINUATION_URL = "https://www.youtube.com/browse_ajax";

import fs from "fs";

function extractJSON(html: string) {
    const result = html.match(/window\["ytInitialData"\] = (\{.+\});$/m);
    if (!result) {
        // save so we can test
        fs.writeFileSync("out.html", html);
        throw new Error("No match; format must have changed?");
    }

    const [, rawJson] = result;
    return JSON.parse(rawJson);
}

function tokenExtractor(tokenName: string) {
    const regex = new RegExp(`['"]${tokenName}['"][,: ]+(?:null|"([^"]+)")`);
    return (html: string, required?: boolean) => {
        const result = html.match(regex);
        if (!result) {
            throw new Error("No match; format must have changed?");
        }

        const [, token] = result;
        if (token === "null") return null;
        return token;
    };
}

const extractIdentityToken = tokenExtractor("ID_TOKEN");
const extractXsrfToken = tokenExtractor("XSRF_TOKEN");

export interface ISectionRenderer {
    contents: any[];

    continuations?: [{
        nextContinuationData: {
            continuation: string,
            clickTrackingParams: string,
        },
    }];
}

export function pageTokenFromSectionRenderer(renderer: ISectionRenderer) {
    if (renderer.continuations && renderer.continuations.length) {
        const continuation = renderer.continuations[0];
        return {
            clickTracking: continuation.nextContinuationData.clickTrackingParams,
            continuation: continuation.nextContinuationData.continuation,
        };
    }
}

function findTabSectionRenderer(json: any): ISectionRenderer {
    const tabs = json.contents.twoColumnBrowseResultsRenderer.tabs;
    const tab = tabs.find((t: any) => t.tabRenderer.selected);

    return tab.tabRenderer.content.sectionListRenderer
        .contents[0].itemSectionRenderer;
}

export class Scraper {

    private identityToken: string | undefined;
    private xsrfToken: string | undefined;

    private cookies: string | undefined;

    constructor(
        private creds?: ICreds,
    ) {}

    public async loadTabSectionRenderer(url: string) {
        const json = await this.fetch(url);

        try {
            return findTabSectionRenderer(json);
        } catch (e) {
            if (!this.cookies && !this.identityToken) {
                throw new Error(
                    "Unable to load resource; auth may be required" +
                    "\nCaused by:\n" + e.stack,
                );
            } else if (!this.identityToken) {
                throw new Error(
                    "Unable to load resource; auth may be invalid" +
                    "\nCaused by:\n" + e.stack,
                );
            } else {
                throw e;
            }
        }
    }

    public async continueTabSectionRenderer(token: IPolymerScrapingContinuation) {
        const json = await this.loadJson(CONTINUATION_URL, {
            form: {
                session_token: this.xsrfToken,
            },
            qs: {
                continuation: token.continuation,
                ctoken: token.continuation,
                itct: token.clickTracking,
            },
        });

        const continuationKey = Object.keys(json.continuationContents)
            .find(it => it.endsWith("Continuation"));

        if (continuationKey) {
            return json.continuationContents[continuationKey];
        }

        return json.continuationContents.itemSectionContinuation;
    }

    private async fetch(url: string) {
        if (this.identityToken) {
            return this.loadJson(url);
        }
        return this.scrapeJson(url);
    }

    private async scrapeJson(url: string) {
        const headers: any = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Host": "www.youtube.com",
            "User-Agent": USER_AGENT,
        };

        const cookies = await this.getCookies();
        if (cookies) {
            headers.Cookie = cookies;
        }

        const html = await request.get({
            headers,
            url,
        });

        this.identityToken = extractIdentityToken(html) || this.identityToken;
        this.xsrfToken = extractXsrfToken(html) || this.xsrfToken;
        return extractJSON(html);
    }

    private async loadJson(url: string, opts?: {qs?: {}, form?: {}}) {
        const { form, qs } = opts || { qs: undefined, form: undefined };
        const fullJson = await request({
            form,
            headers: {
                "Cookie": await this.getCookies(),
                "User-Agent": USER_AGENT,
                "X-Youtube-Client-Name": 1,
                "X-Youtube-Client-Version": "2.20190321",
                "X-Youtube-Identity-Token": this.identityToken,
            },
            json: true,
            method: form === undefined ? "GET" : "POST",
            qs,
            url,
        });

        if (fullJson.reload === "now") {
            return this.scrapeJson(url);
        }

        return fullJson[1].response;
    }

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
