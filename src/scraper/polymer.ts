import _debug from "debug";
const debug = _debug("youtubish:polymer");

import request from "request-promise-native";

import { asCachedCredentialsManager, ICredentialsManager, ICreds } from "../creds";
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
            fs.writeFileSync("out.html", html);
            throw new Error(`No match for token "${tokenName}"; format must have changed?`);
        }

        const [, token] = result;
        if (token === "null") return null;
        return token;
    };
}

const extractIdentityToken = tokenExtractor("ID_TOKEN");
const extractXsrfToken = tokenExtractor("XSRF_TOKEN");

type OldContinuationsList = {
    nextContinuationData: {
        continuation: string,
        clickTrackingParams: string,
    },
}[];

interface NewContinuationsObject {
    continuationEndpoint: {
        clickTrackingParams: string;
        continuationCommand: {
            request: string;
            token: string;
        };
    };
}

export interface ISectionRenderer {
    contents: any[];

    continuations?: OldContinuationsList | NewContinuationsObject;
}

export function pageTokenFromSectionRenderer(renderer: ISectionRenderer) {
    // old style:
    if (Array.isArray(renderer.continuations) && renderer.continuations.length) {
        const continuation = renderer.continuations[0];
        return {
            clickTracking: continuation.nextContinuationData.clickTrackingParams,
            continuation: continuation.nextContinuationData.continuation,
        };
    }

    if (typeof renderer.continuations === 'object' && (renderer.continuations as any).continuationEndpoint) {
        const endpoint = (renderer.continuations as NewContinuationsObject).continuationEndpoint;
        return {
            clickTracking: endpoint.clickTrackingParams,
            continuation: endpoint.continuationCommand.token,
        };
    }
}

function extractSectionRenderer(contents: any[]) {
    const result: ISectionRenderer = contents[0].itemSectionRenderer;

    for (let i=1; i < contents.length; ++i) {
        const extra = contents[i];
        if (!extra) continue;
        if (!extra.itemSectionRenderer) {
            result.continuations = result.continuations
                ?? extra.continuationItemRenderer;
            continue;
        }

        result.contents = result.contents.concat(extra.itemSectionRenderer.contents);
        result.continuations = extra.itemSectionRenderer.continuation
            ?? result.continuations;
    }

    return result;
}

function findTabSectionRenderer(json: any): ISectionRenderer {
    const tabs = json.contents.twoColumnBrowseResultsRenderer.tabs;
    const tab = tabs.find((t: any) => t.tabRenderer.selected);

    const contents = tab.tabRenderer.content.sectionListRenderer.contents;
    return extractSectionRenderer(contents);
}

/**
 * Given a title/description object, attempt to extract its text content,
 * handling differences in APIs/versions
 */
export function textFromObject(obj: any) {
    if (!obj) return "";
    if (typeof obj !== "object") {
        debug("unexpected text object format:", obj);
        return "";
    }

    if (obj.runs) {
        return obj.runs.map((run: any) => run.text).join(" ");
    }

    if (obj.simpleText) {
        return obj.simpleText as string;
    }

    debug("unexpected text object type:", obj);
    return "";
}

export class Scraper {

    private identityToken: string | undefined;
    private xsrfToken: string | undefined;

    private creds: ICredentialsManager;

    constructor(
        creds?: ICreds,
    ) {
        this.creds = asCachedCredentialsManager(creds);
    }

    public async loadTabSectionRenderer(url: string) {
        const json = await this.fetch(url);

        try {
            return findTabSectionRenderer(json);
        } catch (e) {
            const creds = await this.creds.get();
            if (!creds && !this.identityToken) {
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

        if (json.continuationContents) {
            // old version:
            const continuationKey = Object.keys(json.continuationContents)
                .find(it => it.endsWith("Continuation"));

            if (continuationKey) {
                return json.continuationContents[continuationKey];
            }

            return json.continuationContents.itemSectionContinuation;
        }

        if (Array.isArray(json.onResponseReceivedActions)) {
            const continuation = json.onResponseReceivedActions.find(
                (it: any) => it.appendContinuationItemsAction);
            const action = continuation.appendContinuationItemsAction;
            return extractSectionRenderer(action.continuationItems);
        }

        throw new Error("Unexpected continuation format");
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
        const creds = await this.creds.get();
        if (creds) return creds.cookies;
    }
}
