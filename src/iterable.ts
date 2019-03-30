import { Credentials, ICreds } from "./creds";
import { ISectionRenderer, Scraper } from "./scraper";

export class OutOfBoundsError extends Error {
    constructor(message: string) {
        super(message);
    }
}

class IteratorOf<T> implements AsyncIterator<T> {
    private i = 0;

    constructor(
        private entity: IterableEntity<T, any>,
    ) { }

    // NOTE: I'm not sure why the typescript defs for AsyncIterator
    // don't like how we do it, but we're following the MDN example...
    public async next(): Promise<any> {
        const i = this.i;
        if (
            i >= this.entity._items.length
            && !this.entity._hasMore
        ) {
            return { done: true };
        }

        ++this.i;

        try {
            return {
                done: false,
                value: await this.entity.get(i),
            };
        } catch (e) {
            if (e instanceof OutOfBoundsError) {
                return { done: true };
            }

            throw e;
        }
    }
}

export interface IPage<T, TPageToken> {
    items: T[];
    nextPageToken?: TPageToken;
}

export abstract class IterableEntity<T, TPageToken> implements AsyncIterable<T> {

    /** @internal */
    public _items: T[] = [];
    private _nextPageToken: TPageToken | undefined | null;

    public [Symbol.asyncIterator](): AsyncIterator<T> {
        return new IteratorOf(this);
    }

    /**
     * Get the `index`th item in this playlist
     */
    public async get(index: number) {
        while (index >= this._items.length) {
            if (!this._hasMore) {
                throw new OutOfBoundsError(
                    `Out of bounds; requested #${index} / ${this._items.length}`,
                );
            }

            await this._doFetchNextPage();
        }

        return this._items[index];
    }

    /**
     * Find an item in the playlist for which the given predicate
     * function returns true.
     */
    public async find(predicate: (item: T) => boolean) {
        const index = await this.findIndex(predicate);
        if (index === -1) return;
        return this._items[index];
    }

    /**
     * Find the index of the item in the playlist for which the given
     * predicate function returns true, or -1 if none match.
     */
    public async findIndex(predicate: (item: T) => boolean) {

        let i = 0;
        for await (const item of this) {
            if (predicate(item)) {
                return i;
            }
            ++i;
        }

        return -1;
    }

    /**
     * Extract a slice of this Entity. Unlike the normal Javascript
     * array method, omitting end will return *approximately* up to the
     * next "page" of items, and not *every single item* until the end
     * of the entity, since entities may be arbitrarily long.
     */
    public async slice(start?: number, end?: number) {
        if (end === undefined) {
            const fastEnd = (start || 0) + this._pageSize / 2;
            if (fastEnd < this._items.length) {
                return this._items.slice(start || 0, fastEnd);
            }

            if (this._hasMore) {
                await this._doFetchNextPage();
            }

            return this._items.slice(start);
        }

        await this.get(end - 1);
        return this._items.slice(start, end);
    }

    /** @internal */
    public get _hasMore() {
        return this._nextPageToken === undefined
            || this._nextPageToken !== null;
    }

    /** approximate size of each page */
    protected get _pageSize() {
        return 50;
    }

    /**
     * This should return `{ items, nextPageToken }` where
     * `nextPageToken` is a non-empty string if there are more results
     */
    protected abstract async _fetchNextPage(
        token: TPageToken | undefined,
    ): Promise<{ items: T[], nextPageToken?: TPageToken}>;

    protected async _doFetchNextPage() {
        if (!this._hasMore) throw new Error("No next page to fetch");

        const page = await this._fetchNextPage(
            this._nextPageToken || undefined,
        );
        this._nextPageToken = page.nextPageToken || null;
        if (typeof this._nextPageToken === "string" && !this._nextPageToken.length) {
            this._nextPageToken = null;
        }
        this._items.push(...page.items);
    }

}

/**
 * Convenience subclass of IterableEntity that can accept either a
 * Credentials instance or a Promise that resolves to a Credentials
 * instance, and fills out `this.creds` before `_fetchNextPage` is
 * called
 */
export abstract class AuthedIterableEntity<T> extends IterableEntity<T, string> {

    protected creds: Credentials | undefined;
    private _creds: ICreds;

    constructor(creds: ICreds) {
        super();
        this._creds = creds;
    }

    protected async _doFetchNextPage() {
        if (!this.creds) {
            this.creds = await this._creds;
        }

        return super._doFetchNextPage();
    }
}

export interface IScrapingContinuation {
    clickTracking: string;
    continuation: string;
}

export abstract class ScrapingIterableEntity<T> extends IterableEntity<T, IScrapingContinuation> {

    /** @internal */
    public scraper: Scraper;

    constructor(
        creds: ICreds,
        private url: string,
        private scrapePage: (section: ISectionRenderer) => IPage<T, IScrapingContinuation>,
    ) {
        super();
        this.scraper = new Scraper(creds);
    }

    protected async _fetchNextPage(pageToken: IScrapingContinuation | undefined) {
        let section: ISectionRenderer;
        if (!pageToken) {
            section = await this.scraper.loadTabSectionRenderer(this.url);
        } else {
            section = await this.scraper.continueTabSectionRenderer(pageToken);
        }

        return this.scrapePage(section);
    }

}
