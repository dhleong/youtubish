import _debug from "debug";
const debug = _debug("youtubish:polymer");

import cheerio from "cheerio";
import crypto from "crypto";
import axios from "../axios";

import fs from "fs";
import { formDataFrom } from "../util";

import { asCachedCredentialsManager, ICredentialsManager, ICreds } from "../creds";
import { IPolymerScrapingContinuation } from "../iterable/polymer";

// using this agent triggers Google to return some JSON we can consume
// tslint:disable-next-line max-line-length
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

const URL_BASE = "https://www.youtube.com";
const CONTINUATION_URL = URL_BASE + "/youtubei/v1/browse";
const YOUTUBEI_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const CLIENT_INFO = {
    // the app sends a bunch more, but this seems sufficient:
    userAgent: USER_AGENT,
    clientName: "WEB",
    clientVersion: "2.20210308.08.00",
    platform: "DESKTOP",
    clientFormFactor: "UNKNOWN_FORM_FACTOR",
};

interface InnertubeInfo {
    apiKey?: string,
    clientVersion?: string,
}

function extractJSONFromScripts(html: string) {
    const $ = cheerio.load(html);

    let matchedJson: any | undefined;
    $("script").each((_, el) => {
        const contents = $(el).html();
        if (!contents) return;

        const match = contents.match(/^var ytInitialData = (\{.+\});$/m);
        if (match) {
            const [, rawJson] = match;
            matchedJson = JSON.parse(rawJson);
            return false;
        }
    })
    return matchedJson;
}

function extractJSON(html: string) {
    // take 1: old style
    const result = html.match(/window\["ytInitialData"\] = (\{.+\});$/m);
    if (result) {
        debug("found json on window:", result);
        const [, rawJson] = result;
        return JSON.parse(rawJson);
    }

    // take 2: new style
    debug("couldn't find window data assignment; checking script tags");
    const fromScripts = extractJSONFromScripts(html);
    if (fromScripts) {
        debug("found json from scripts:", fromScripts);
        return fromScripts;
    }

    // save so we can test
    fs.writeFileSync("out.html", html);
    throw new Error("No match; format must have changed?");
}

function extractInnertubeInfo(html: string) {
    const info = {
        apiKey: extractInnertubeApiKey(html),
        clientVersion: extractInnertubeClientVersion(html),
    };
    if (info.apiKey || info.clientVersion) {
        debug("extracted innertube info:", info);
        return info;
    }
}

function extractInnertubeApiKey(html: string) {
    const lowerApiMatch = html.match(/"innertubeApiKey":"([^"]+)"/);
    if (lowerApiMatch && lowerApiMatch.length >= 2) {
        return lowerApiMatch[1];
    }
    const upperApiMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (upperApiMatch && upperApiMatch.length >= 2) {
        return upperApiMatch[1];
    }
}

function extractInnertubeClientVersion(html: string) {
    const lowerMatch = html.match(/"innertubeContextClientVersion":"([^"]+)"/);
    if (lowerMatch && lowerMatch.length >= 2) {
        return lowerMatch[1];
    }
    const upperMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    if (upperMatch && upperMatch.length >= 2) {
        return upperMatch[1];
    }
}


function tokenExtractor(tokenName: string) {
    const regex = new RegExp(`['"]${tokenName}['"][,: ]+(?:null|"([^"]+)")`);
    return (html: string, _required?: boolean) => {
        const result = html.match(regex);
        if (!result) {
            fs.writeFileSync("out.html", html);
            throw new Error(`No match for token "${tokenName}"; format must have changed?`);
        }

        const [, token] = result;
        if (token === "null") return null;

        const value = token.replace(/\\u003d/g, "=");
        debug("extracted", tokenName, " <- ", value);
        return value;
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
        commandMetadata?: {
            webCommandMetadata?: {
                apiUrl: string,
            }
        };
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

function pageTokenFromContinuationEndpoint(
    container: any,
) {
    if (!(container as any).continuationEndpoint) return;

    const endpoint = (container as NewContinuationsObject).continuationEndpoint;
    return {
        clickTracking: endpoint.clickTrackingParams,
        continuation: endpoint.continuationCommand.token,
        url: endpoint.commandMetadata?.webCommandMetadata?.apiUrl,
    };
}

export function pageTokenFromSectionRenderer(renderer: ISectionRenderer) {
    // v1 (maybe very old?)
    if (Array.isArray(renderer.continuations) && renderer.continuations.length) {
        const continuation = renderer.continuations[0];
        return {
            clickTracking: continuation.nextContinuationData.clickTrackingParams,
            continuation: continuation.nextContinuationData.continuation,
        };
    }

    // v2
    if (typeof renderer.continuations === 'object') {
        const token = pageTokenFromContinuationEndpoint(
            renderer.continuations,
        )
        if (token) return token;
    }

    // current
    const last = renderer.contents.length
        ? renderer.contents[renderer.contents.length - 1]
        : null;
    if (last && last.continuationItemRenderer) {
        debug("last", last);

        const token = pageTokenFromContinuationEndpoint(
            last.continuationItemRenderer,
        )
        if (token) return token;
    }
}

function extractSectionRenderer(contents: any[]) {
    const result: ISectionRenderer = contents[0].itemSectionRenderer;
    if (!result) return;

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
    const section = extractSectionRenderer(contents);
    if (section) return section;

    throw new Error("Couldn't find section renderer");
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

    private identityToken?: string;
    private xsrfToken?: string;
    private innertubeInfo?: InnertubeInfo;

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
        const json = token.url
            ? await this.loadInnertubeJsonContinuation(token)
            : await this.loadLegacyJsonContinuation(token);

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
            const renderer = extractSectionRenderer(action.continuationItems);
            if (renderer) return renderer;
            if (Array.isArray(action.continuationItems)) {
                return {
                    contents: action.continuationItems,
                };
            }
        }

        fs.writeFileSync("continuation.json", JSON.stringify(json, null, 2));
        throw new Error("Unexpected continuation format");
    }

    private async loadInnertubeJsonContinuation(token: IPolymerScrapingContinuation) {
        const client = { ... CLIENT_INFO };

        if (this.innertubeInfo?.clientVersion) {
            client.clientVersion = this.innertubeInfo.clientVersion;
        }

        return this.loadJson(URL_BASE + token.url, {
            authorize: true,
            body: {
                context: {
                    clickTracking: {
                        clickTrackingParams: token.clickTracking,
                    },
                    client: CLIENT_INFO,
                },
                continuation: token.continuation,
            },
            qs: {
                key: this.innertubeInfo?.apiKey ?? YOUTUBEI_API_KEY,
            },
        });
    }

    private async loadLegacyJsonContinuation(token: IPolymerScrapingContinuation) {
        return this.loadJson(CONTINUATION_URL, {
            form: {
                session_token: this.xsrfToken,
            },
            qs: {
                continuation: token.continuation,
                ctoken: token.continuation,
                itct: token.clickTracking,
            },
        })
    }

    private async fetch(url: string) {
        if (this.identityToken) {
            return this.loadJson(url);
        }
        return this.scrapeJson(url);
    }

    private async scrapeJson(url: string, opts?: {qs?: {}, form?: Record<string, any>}) {
        const { form, qs } = opts || { qs: undefined, form: undefined };
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

        debug("loading:", url, qs, form);
        const data = formDataFrom(form);
        const response = await axios({
            data,
            headers,
            method: form === undefined ? "GET" : "POST",
            params: qs,
            url,
        });
        const html = response.data;

        if (typeof html === "string") {
            this.identityToken = extractIdentityToken(html) || this.identityToken;
            this.xsrfToken = extractXsrfToken(html) || this.xsrfToken;
            this.innertubeInfo = extractInnertubeInfo(html) || this.innertubeInfo;
            return extractJSON(html);
        } else {
            debug("result: ", html);
            return html;
        }
    }

    private async loadJson(
        url: string,
        opts?: {
            authorize?: boolean,
            body?: {},
            qs?: {},
            form?: Record<string, any>,
        },
    ) {
        const { form, qs } = opts || { qs: undefined, form: undefined };

        debug("loadJson:", url, opts);
        const cookies = await this.getCookies();
        const authorization = !(opts?.authorize && cookies) ? undefined
            : `SAPISIDHASH ${generateSapiSidHash(cookies)}`;

        const data = formDataFrom(form) ?? opts?.body;
        const { data: fullJson } = await axios({
            data,
            headers: {
                "Authorization": authorization,
                "Cookie": await this.getCookies(),
                "Origin": URL_BASE,
                "User-Agent": USER_AGENT,
                "X-Youtube-Client-Name": 1,
                "X-Youtube-Client-Version": "2.20190321",
                "X-Youtube-Identity-Token": this.identityToken,
            },
            method: data === undefined ? "GET" : "POST",
            params: qs,
            url,
        });

        if (fullJson.reload === "now") {
            debug("reloading:", url, "from: ", fullJson);
            return this.scrapeJson(url, opts);
        }

        if (Array.isArray(fullJson)) {
            return fullJson[1].response;
        }

        return fullJson;
    }

    private async getCookies() {
        const creds = await this.creds.get();
        if (creds) return creds.cookies;
    }
}

function generateSapiSidHash(cookies: string) {
    const m = cookies.match(/SAPISID=([^;]+);/);
    if (!m || m.length < 2) return;
    const sapisid = m[1];

    const date = new Date().getTime();
    const toHash = `${date} ${sapisid} ${URL_BASE}`;

    const shasum = crypto.createHash("sha1");
    shasum.update(toHash);
    const hash = shasum.digest("hex");

    return `${date}_${hash}`;
}
