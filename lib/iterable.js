class OutOfBoundsError extends Error {
    constructor(message) {
        super(message);
    }
}

class IteratorOf {
    constructor(entity) {
        this.i = 0;
        this.entity = entity;
    }

    async next() {
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
                value: await this.entity.get(i),
                done: false,
            };
        } catch (e) {
            if (e instanceof OutOfBoundsError) {
                return { done: true };
            }

            throw e;
        }
    }
}

class IterableEntity {

    constructor() {
        this._items = [];
        this._nextPageToken = undefined;
    }

    [Symbol.asyncIterator]() {
        return new IteratorOf(this);
    }

    /**
     * Get the `index`th item in this playlist
     */
    async get(index) {
        while (index >= this._items.length) {
            if (!this._hasMore) {
                throw new OutOfBoundsError(
                    `Out of bounds; requested #${index} / ${this._items.length}`
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
    async find(predicate) {
        const index = await this.findIndex(predicate);
        if (index === -1) return;
        return this._items[index];
    }

    /**
     * Find the index of the item in the playlist for which the given
     * predicate function returns true, or -1 if none match.
     */
    async findIndex(predicate) {

        let i = 0;
        for await (const item of this) {
            if (predicate(item)) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Extract a slice of this Entity. Unlike the normal Javascript
     * array method, omitting end will return *approximately* up to the
     * next "page" of items, and not *every single item* until the end
     * of the entity, since entities may be arbitrarily long.
     */
    async slice(start, end) {
        if (end === undefined) {
            const fastEnd = start + this._pageSize / 2;
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

    get _hasMore() {
        return this._nextPageToken === undefined
            || (
                typeof this._nextPageToken === 'string'
                && this._nextPageToken.length
            );
    }

    /** approximate size of each page */
    get _pageSize() {
        return 50;
    }

    async _doFetchNextPage() {
        if (!this._hasMore) throw new Error('No next page to fetch');

        const page = await this._fetchNextPage(
            this._nextPageToken,
        );
        this._nextPageToken = page.nextPageToken || null;
        this._items.push(...page.items);
    }

    /**
     * This should return `{ items, nextPageToken }` where
     * `nextPageToken` is a non-empty string if there are more results
     */
    async _fetchNextPage() {
        throw new Error('Not implemented');
    }
}

/**
 * Convenience subclass of IterableEntity that can accept either a
 * Credentials instance or a Promise that resolves to a Credentials
 * instance, and fills out `this.creds` before `_fetchNextPage` is
 * called
 */
class AuthedIterableEntity extends IterableEntity {
    constructor(creds) {
        super();
        this._creds = creds;
    }

    async _doFetchNextPage() {
        if (!this.creds) {
            this.creds = await this._creds;
        }

        return super._doFetchNextPage();
    }
}

module.exports = {
    AuthedIterableEntity,
    IterableEntity,
};
