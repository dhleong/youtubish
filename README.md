youtubish
=========

*utils for accessing your youtube data*

## What?

Youtubish is a suite of web scraping-based tools that provide access to your personal Youtube data that cannot typically be accessed by Google's public APIs. It is used to power the "resume playlist" ability of [babbling][1] and its auth tools power [gakki][2].

## How?

### Youtube Auth

Google is very careful about their auth, and normally we can all be grateful for that since it helps keep our accounts secure—but if we have a practical reason to access *our own data* it becomes an annoyance. Luckily, Youtubish comes with batteries included:

```typescript
import { exchangeAuthCode } from "youtubish/dist/auth";
import { requestAuthCode } from "youtubish/dist/login";

async function login() {
    // This function opens a Chrome window to drive a secure login.
    const authCode = await requestAuthCode();

    // tokens is an Object structured as:
    // {
    //   refreshToken: string,
    //   access: {
    //     token: string,
    //     expiresAt: number,
    //   }
    // }
    //
    const tokens = await exchangeAuthCode(authCode);

    return tokens;
}
```

### Watch History

Once you have those tokens, you can load them up and plug them into Youtubish:

```typescript
import {
    cached,
    OauthCredentialsManager,
} from "youtubish/dist/creds";
import { WatchHistory, YoutubePlaylist } from "youtubish";

const tokens = loadJson('tokens.json');

const creds = cached(new OauthCredentialsManager(tokens, {
    // It's good to update credentials as they become available:
    async persistCredentials(newTokens) {
        await writeJson('tokens.json', newTokens);
    }
}));

const playlistId = "WL"; // Special ID for the "watch later" playlist
                         // Any normal ID will work, though!

const history = new WatchHistory(creds);
const playlist = new YoutubePlaylist(creds, playlistId);

// If possible, find the most-recently played video in this playlist.
// You can optionally specify how far back in your watch history to look;
// if unspecified (as here) it will look 200 items into your watch history:
const video = await playlist.findMostRecentlyPlayed(history);
```

### Other APIs

The `YoutubePlaylist` and `WatchHistory` classes both implement the [IIterableEntity][3] interface which means, among other things, you can:

```typescript
// Read by index:
const first = await playlist.get(0);

// Fetch a subset of videos; this promise resolves to a normal Array
const slice = await playlist.slice(10, 20);

// Returns a filtered view of this Playlist; iterating and other methods work as
// expected, but only matching items will be visible. Because it is a View, the
// indices of items `filtered` may not line up with those in `playlist`!
const filtered = playlist.filter(video => video.title.includes("Best"));

for await (const video of playlist) {
    // Iterate over *every item* in a Playlist (or your watch history!)
    // Note the `for await`; items will be paged in on demand as you iterate,
    // and Watch History can be quite long, so be careful here!
}
```

See the interface linked above for all supported methods.

[1]: https://github.com/dhleong/babbling
[2]: https://github.com/dhleong/gakki
[3]: https://github.com/dhleong/youtubish/blob/fb13f148334114b9d8510982708fa994206b5d1d/src/iterable.ts#L49
