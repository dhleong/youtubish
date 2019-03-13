const request = require('request-promise-native');

const { AuthedIterableEntity } = require('./iterable');

// using this agent triggers Google to return some JSON we can consume
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36';

const HISTORY_URL = 'https://www.youtube.com/feed/history';

function extractJSON(html) {
    const result = html.match(/window\["ytInitialData"\] = (\{.+\});$/m);
    if (!result) {
        // save so we can test
        throw new Error('No match; format must have changed?');
    }

    const [, rawJson] = result;
    return JSON.parse(rawJson);
}

function findTabContents(json, tabId) {
    const tabs = json.contents.twoColumnBrowseResultsRenderer.tabs;
    const tab = tabs.find(tab => tab.tabRenderer.tabIdentifier === tabId);

    return tab.tabRenderer.content.sectionListRenderer
        .contents[0].itemSectionRenderer.contents;
}

function scrapeWatchHistory(html) {
    const json = extractJSON(html);

    const rawItems = findTabContents(json, 'FEhistory');

    const items = rawItems.map(({videoRenderer: renderer}) => ({
        title: renderer.title.simpleText,
        desc: renderer.descriptionSnippet
            ? renderer.descriptionSnippet.simpleText
            : '',
        id: renderer.videoId,
    }));

    // TODO nextPageToken?
    return { items };
}

class WatchHistory extends AuthedIterableEntity {
    constructor(creds) {
        super(creds);
    }

    async _fetchNextPage(pageToken) {
        if (!pageToken) {
            // first page
            const html = await this._requestHtml(HISTORY_URL);
            return scrapeWatchHistory(html);
        }

        // only one page supported, for now
        throw new Error('Illegal state');
    }

    async _requestHtml(url) {
        return request({
            url,
            headers: {
                Cookie: this.creds.cookies,
                'User-Agent': USER_AGENT,
            },
        });
    }
}

module.exports = {
    WatchHistory,
};
