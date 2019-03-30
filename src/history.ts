import request from "request-promise-native";

import { ICreds } from "./creds";
import { IScrapingContinuation, ScrapingIterableEntity } from "./iterable";
import { IVideo } from "./model";
import { ISectionRenderer, pageTokenFromSectionRenderer, Scraper } from "./scraper";

const HISTORY_URL = "https://www.youtube.com/feed/history";

function scrapeWatchHistory(sectionRenderer: ISectionRenderer) {
    const items = sectionRenderer.contents.map(({videoRenderer: renderer}) => ({
        desc: renderer.descriptionSnippet
            ? renderer.descriptionSnippet.simpleText
            : "",
        id: renderer.videoId,
        title: renderer.title.simpleText,
    }));

    const nextPageToken = pageTokenFromSectionRenderer(sectionRenderer);

    return { items, nextPageToken };
}

export class WatchHistory extends ScrapingIterableEntity<IVideo> {

    constructor(creds: ICreds) {
        super(creds, HISTORY_URL, scrapeWatchHistory);
    }

}
