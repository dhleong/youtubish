const request = require('request-promise-native');

const { AuthedIterableEntity } = require('./iterable');

const PLAYLIST_ENDPOINT = 'https://www.googleapis.com/youtube/v3/playlistItems';

class YoutubePlaylist extends AuthedIterableEntity {
    constructor(creds, id) {
        super(creds);

        this.id = id;
    }

    async _fetchNextPage(pageToken) {
        const json = await request.get({
            url: PLAYLIST_ENDPOINT,
            json: true,
            qs: {
                key: this.creds.apiKey,
                maxResults: 50,
                part: 'snippet',
                playlistId: this.id,
                pageToken,
            },
        });

        const nextPageToken = json.nextPageToken;
        const items = json.items.map(({snippet}) => ({
            id: snippet.resourceId.videoId,
            title: snippet.title,
        }));

        return { items, nextPageToken };
    }
}

module.exports = {
    YoutubePlaylist,
};
