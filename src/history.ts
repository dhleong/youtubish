import request from "request-promise-native";

import { ICreds } from "./creds";
import {
    DelegateIterable,
    IIterableEntity,
    isIterableEntity,
} from "./iterable";
import { PolymerScrapingIterableEntity } from "./iterable/polymer";
import { IVideo } from "./model";
import { ISectionRenderer, pageTokenFromSectionRenderer, Scraper } from "./scraper/polymer";

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

class PolymerWatchHistory extends PolymerScrapingIterableEntity<IVideo> {

    constructor(creds: ICreds) {
        super(creds, HISTORY_URL, scrapeWatchHistory);
    }

}

export class WatchHistory extends DelegateIterable<IVideo, WatchHistory> {

    constructor(
        creds: ICreds,
    );

    /** @internal Delegate factory */
    // tslint:disable-next-line unified-signatures to hide internal constructor
    constructor(base: IIterableEntity<IVideo, any>);

    /** @internal actual constructor */
    constructor(
        credsOrBase: ICreds | IIterableEntity<IVideo, any>,
    ) {
        super(
            isIterableEntity(credsOrBase)
                ? credsOrBase
                : new PolymerWatchHistory(credsOrBase as ICreds),
            WatchHistory,
        );
    }
}
