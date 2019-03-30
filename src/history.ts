import request from "request-promise-native";

import { ICreds } from "./creds";
import { AuthedIterableEntity } from "./iterable";
import { IVideo } from "./model";

// using this agent triggers Google to return some JSON we can consume
// tslint:disable-next-line max-line-length
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

const HISTORY_URL = "https://www.youtube.com/feed/history";

function extractJSON(html: string) {
    const result = html.match(/window\["ytInitialData"\] = (\{.+\});$/m);
    if (!result) {
        // save so we can test
        throw new Error("No match; format must have changed?");
    }

    const [, rawJson] = result;
    return JSON.parse(rawJson);
}

function findTabContents(json: any, tabId: string) {
    const tabs = json.contents.twoColumnBrowseResultsRenderer.tabs;
    const tab = tabs.find((t: any) => t.tabRenderer.tabIdentifier === tabId);

    return tab.tabRenderer.content.sectionListRenderer
        .contents[0].itemSectionRenderer.contents;
}

function scrapeWatchHistory(html: string) {
    const json = extractJSON(html);

    const rawItems = findTabContents(json, "FEhistory") as any[];

    const items = rawItems.map(({videoRenderer: renderer}) => ({
        desc: renderer.descriptionSnippet
            ? renderer.descriptionSnippet.simpleText
            : "",
        id: renderer.videoId,
        title: renderer.title.simpleText,
    }));

    // TODO nextPageToken?
    return { items };
}

export class WatchHistory extends AuthedIterableEntity<IVideo> {
    constructor(creds: ICreds) {
        super(creds);
    }

    public async _fetchNextPage(pageToken: string | undefined) {
        if (!pageToken) {
            // first page
            const html = await this._requestHtml(HISTORY_URL);
            return scrapeWatchHistory(html);
        }

        // only one page supported, for now
        throw new Error("Illegal state");
    }

    public async _requestHtml(url: string) {
        if (!this.creds) throw new Error();
        if (!this.creds.cookies) {
            throw new Error("You must provide cookies to access Watch History");
        }

        return request({
            headers: {
                "Cookie": this.creds.cookies,
                "User-Agent": USER_AGENT,
            },
            url,
        });
    }
}

module.exports = {
    WatchHistory,
};
