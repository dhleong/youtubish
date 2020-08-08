import request from "request-promise-native";

import { ICreds } from "./creds";
import {
    DelegateIterable,
    IIterableEntity,
    isIterableEntity,
} from "./iterable";
import { AngularScrapingIterableEntity } from "./iterable/angular";
import { PolymerScrapingIterableEntity } from "./iterable/polymer";
import { IVideo } from "./model";
import {
    ISectionRenderer,
    pageTokenFromSectionRenderer,
    textFromObject,
    Scraper,
} from "./scraper/polymer";

const HISTORY_URL = "https://www.youtube.com/feed/history";

//
// Polymer implementation
//

function scrapeWatchHistory(sectionRenderer: ISectionRenderer) {
    const items = sectionRenderer.contents.map(({videoRenderer: renderer}) => {
        return {
            desc: textFromObject(renderer.descriptionSnippet),
            id: renderer.videoId,
            title: textFromObject(renderer.title),
        }
    });

    const nextPageToken = pageTokenFromSectionRenderer(sectionRenderer);
    console.log("results=", items.length, nextPageToken);

    return { items, nextPageToken };
}

class PolymerWatchHistory extends PolymerScrapingIterableEntity<IVideo> {

    constructor(creds: ICreds) {
        super(creds, HISTORY_URL, scrapeWatchHistory);
    }

}

//
// Angular implementation
// NOTE: it seems google is now finally going to kill this version, and is
// starting to ignore the disable_polymer query param...
//

function angularScrapeWatchHistory(
    $: CheerioStatic,
) {
    if ($(".signin-container").length) {
        throw new Error("Signed out");
    }

    const items: IVideo[] = $(".yt-lockup").map((_, element) => {
        const el = $(element);
        return {
            desc: el.find(".yt-lockup-description").text(),
            id: el.attr("data-context-item-id"),
            title: el.find(".yt-uix-tile-link").attr("title"),
        };
    }).get();

    return { items };
}

class AngularWatchHistory extends AngularScrapingIterableEntity<IVideo> {

    constructor(creds: ICreds) {
        super(creds, HISTORY_URL, angularScrapeWatchHistory);
    }

}

//
// Public, exported implementation
//

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
