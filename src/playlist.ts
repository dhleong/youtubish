import request from "request-promise-native";

import { ICreds } from "./creds";
import { WatchHistory } from "./history";
import { AuthedIterableEntity } from "./iterable";
import { IVideo } from "./model";

const PLAYLIST_ENDPOINT = "https://www.googleapis.com/youtube/v3/playlistItems";

export class YoutubePlaylist extends AuthedIterableEntity<IVideo> {
    constructor(
        creds: ICreds,
        public readonly id: string,
    ) {
        super(creds);
    }

    /**
     * Given an instance of WatchHistory, attempt to
     * find the most recently-played item in this playlist.
     */
    public async findMostRecentlyPlayed(history: WatchHistory) {
        const historySlice = await history.slice();

        for (const historyItem of historySlice) {
            for await (const item of this) {
                if (item.id === historyItem.id) {
                    return item;
                }
            }
        }

        throw new Error(`Couldn't find item to resume`);
    }

    public async _fetchNextPage(pageToken: string | undefined) {
        if (!this.creds) throw new Error();

        const json = await request.get({
            json: true,
            qs: {
                key: this.creds.apiKey,
                maxResults: 50,
                pageToken,
                part: "snippet",
                playlistId: this.id,
            },
            url: PLAYLIST_ENDPOINT,
        });

        const nextPageToken = json.nextPageToken;
        const items = (json.items as any[]).map(({snippet}) => ({
            desc: "", // ?
            id: snippet.resourceId.videoId,
            title: snippet.title,
        }));

        return { items, nextPageToken };
    }
}
