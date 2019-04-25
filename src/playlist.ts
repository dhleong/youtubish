import request from "request-promise-native";

import { ICreds } from "./creds";
import { WatchHistory } from "./history";
import {
    AuthedIterableEntity,
    DelegateIterable,
    IIterableEntity,
    isIterableEntity,
    IterableEntity,
    ScrapingIterableEntity,
} from "./iterable";
import { IVideo } from "./model";
import { ISectionRenderer, pageTokenFromSectionRenderer } from "./scraper";

const PLAYLIST_URL = "https://www.youtube.com/playlist?list=%s";

function scrapePlaylist(sectionRenderer: ISectionRenderer) {
    if (!sectionRenderer.contents.length) {
        return { items: [] };
    }
    if (sectionRenderer.contents[0].playlistVideoListRenderer) {
        sectionRenderer = sectionRenderer.contents[0].playlistVideoListRenderer;
    }

    const items = sectionRenderer.contents.map(({playlistVideoRenderer: renderer}) => ({
        desc: renderer.descriptionSnippet
            ? renderer.descriptionSnippet.simpleText
            : "",
        id: renderer.videoId,
        title: renderer.title.simpleText,
    }));
    const nextPageToken = pageTokenFromSectionRenderer(sectionRenderer);

    return { items, nextPageToken };
}

class BaseYoutubePlaylist extends ScrapingIterableEntity<IVideo> {

    constructor(
        creds: ICreds,
        public readonly id: string,
    ) {
        super(creds, PLAYLIST_URL.replace("%s", id), scrapePlaylist);
    }

}

export class YoutubePlaylist extends DelegateIterable<IVideo, YoutubePlaylist> {

    constructor(
        creds: ICreds,
        id: string,
    );

    /** @internal Delegate factory */
    constructor(base: IIterableEntity<IVideo, any>);

    /** @internal actual constructor */
    constructor(
        credsOrBase: ICreds | IIterableEntity<IVideo, any>,
        id?: string,
    ) {
        super(
            isIterableEntity(credsOrBase)
                ? credsOrBase
                : new BaseYoutubePlaylist(credsOrBase as ICreds, id!),
            YoutubePlaylist,
        );
    }

    /**
     * Given an instance of WatchHistory, attempt to
     * find the most recently-played item in this playlist.
     *
     * @param historySearchLimit Max number of items in the
     * history to search before giving up (default: 200)
     */
    public async findMostRecentlyPlayed(
        history: WatchHistory,
        historySearchLimit: number = 200,
    ) {
        const limited = history.take(historySearchLimit);
        const found = await this.findFirstMemberOf(limited, (a, b) => a.id === b.id);

        if (!found) {
            throw new Error(`Couldn't find item to resume`);
        }

        return found;
    }

}
