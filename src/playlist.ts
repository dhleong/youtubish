import { ICreds } from "./creds";
import { WatchHistory } from "./history";
import {
    DelegateIterable,
    IIterableEntity,
    isIterableEntity,
    IterableEntity,
} from "./iterable";
import { AngularScrapingIterableEntity } from "./iterable/angular";
import { PolymerScrapingIterableEntity } from "./iterable/polymer";
import { IVideo } from "./model";
import {
    ISectionRenderer,
    pageTokenFromSectionRenderer,
    textFromObject,
} from "./scraper/polymer";

const PLAYLIST_URL = "https://www.youtube.com/playlist?list=%s";

//
// Polymer implementation
//

function scrapePlaylist(sectionRenderer: ISectionRenderer) {
    if (!sectionRenderer.contents.length) {
        return { items: [] };
    }
    if (sectionRenderer.contents[0].playlistVideoListRenderer) {
        sectionRenderer = sectionRenderer.contents[0].playlistVideoListRenderer;
    }

    const items = sectionRenderer.contents.map(({playlistVideoRenderer: renderer}) => {
        return {
            desc: textFromObject(renderer.descriptionSnippet),
            id: renderer.videoId,
            title: textFromObject(renderer.title),
        }
    });
    const nextPageToken = pageTokenFromSectionRenderer(sectionRenderer);

    return { items, nextPageToken };
}

class PolymerYoutubePlaylist extends PolymerScrapingIterableEntity<IVideo> {

    constructor(
        creds: ICreds | undefined,
        public readonly id: string,
    ) {
        super(creds, PLAYLIST_URL.replace("%s", id), scrapePlaylist);
    }

}

//
// Angular implementation
//

function angularScrapePlaylist(
    $: CheerioStatic,
) {
    const items: IVideo[] = $(".pl-video").map((_, element) => {
        const el = $(element);
        return {
            desc: "",
            id: el.attr("data-video-id"),
            title: el.attr("data-title"),
        };
    }).get();

    return { items };
}

class AngularYoutubePlaylist extends AngularScrapingIterableEntity<IVideo> {

    constructor(
        creds: ICreds | undefined,
        public readonly id: string,
    ) {
        super(creds, PLAYLIST_URL.replace("%s", id), angularScrapePlaylist);
    }

}

//
// Public, exported implementation
//

export class YoutubePlaylist extends DelegateIterable<IVideo, YoutubePlaylist> {

    constructor(id: string);
    constructor(
        creds: ICreds,
        id: string,
    );

    /** @internal Delegate factory */
    // tslint:disable-next-line unified-signatures
    constructor(base: IIterableEntity<IVideo, any>);

    /** @internal actual constructor */
    constructor(
        credsOrBaseOrId: ICreds | IIterableEntity<IVideo, any> | string,
        id?: string,
    ) {
        super(
            typeof credsOrBaseOrId === "string"
                ? new AngularYoutubePlaylist(undefined, credsOrBaseOrId)
                : isIterableEntity(credsOrBaseOrId)
                    ? credsOrBaseOrId
                    : new AngularYoutubePlaylist(credsOrBaseOrId as ICreds, id!),
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
