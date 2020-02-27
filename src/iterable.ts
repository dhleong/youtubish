import { asCredentialsManager, ICredentials, ICreds } from "./creds";

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

export interface IIterableEntity<T, TSelf> extends AsyncIterable<T> {
    get(index: number): Promise<T>;
    filter(predicate: (item: T) => boolean): TSelf;
    find(predicate: (item: T) => boolean): Promise<T | undefined>;
    findIndex(predicate: (item: T) => boolean): Promise<number>;
    findFirstMemberOf(
        other: IIterableEntity<T, any>,
        areEqual: (a: T, b: T) => boolean,
    ): Promise<T | null>;
    slice(start?: number, end?: number): Promise<T[]>;
    take(count: number): TSelf;
}

export function isIterableEntity(v: any): v is IIterableEntity<any, any> {
    if (!v) return false;
    return (v as any).findFirstMemberOf !== undefined;
}

export abstract class IterableEntity<T, TPageToken>
implements IIterableEntity<T, IterableEntity<T, TPageToken>> {

    /** @internal */
    public _items: T[] = [];

    /** @internal */
    public _nextPageToken: TPageToken | undefined | null;

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
     * Find the first item in `other` that is also in this Iterable.
     * This operation might iterate over every item in *this*
     * Iterable for each item checked `other`, so if at all possible
     * you should prefer to pass the larger Iterable as the argument
     * rather than as `this`.
     *
     * Returns null if no matching item was found
     */
    public async findFirstMemberOf(
        other: IterableEntity<T, any>,
        areEqual: (a: T, b: T) => boolean,
    ) {
        // prefetch the first page in parallel
        // for a ~35% speed boost (~4s -> ~2.6s)
        await Promise.all([
            other.slice(),
            this.slice(),
        ]);

        for await (const otherItem of other) {
            for await (const item of this) {
                if (areEqual(item, otherItem)) {
                    return item;
                }
            }
        }

        return null;
    }

    /**
     * Return a new IterableEntity based on this one
     * that only contains items for which `predicate`
     * returns `true`.
     */
    public filter(
        predicate: (item: T) => boolean,
    ): IterableEntity<T, TPageToken> {
        return new FilteredIterableEntity(
            this,
            predicate,
        );
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

    /**
     * Lazy operation that returns up to the first `count` items
     * in this iterable.
     */
    public take(count: number) {
        return new CountLimitedIterableEntity<T, TPageToken>(
            this,
            count,
        );
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
    ): Promise<IPage<T, TPageToken>>;

    protected async _doFetchNextPage(): Promise<IPage<T, TPageToken>> {
        if (!this._hasMore) throw new Error("No next page to fetch");

        const page = await this._fetchNextPage(
            this._nextPageToken || undefined,
        );
        this._nextPageToken = page.nextPageToken || null;
        if (typeof this._nextPageToken === "string" && !this._nextPageToken.length) {
            this._nextPageToken = null;
        }
        this._items.push(...page.items);
        return page;
    }

}

/**
 * `WrappedIterableEntity` is a convenience base class for
 * implementing lazy functional methods, such as `filter`, which
 * share state with a delegate object while also imposing their
 * own rules on the content of `this` entity.
 */
abstract class WrappedIterableEntity<T, TPageToken>
extends IterableEntity<T, TPageToken> {
    constructor(
        protected base: IterableEntity<T, TPageToken>,
    ) {
        super();
    }

    protected get _pageSize() {
        // HAX as below:
        return (this.base as any)._pageSize as number;
    }

    protected async fetchBaseNextPage(token: TPageToken | undefined) {
        // HAX to simply access the protected method;
        // we could make it @internal public but that feels like
        // an annoying limitation on consumers of this library
        // being unable to extend IterableEntity...
        // NOTE: we use _doFetchNextPage so we don't corrupt the
        // original entity's state by failing to update eg: nextPageToken
        const result: IPage<T, TPageToken> =
            await (this.base as any)._doFetchNextPage(token);

        return result;
    }
}

class FilteredIterableEntity<T, TPageToken>
extends WrappedIterableEntity<T, TPageToken> {

    constructor(
        base: IterableEntity<T, TPageToken>,
        private predicate: (item: T) => boolean,
    ) {
        super(base);

        // copy state
        this._items = base._items.slice().filter(this.predicate);
        this._nextPageToken = base._nextPageToken;
    }

    protected async _fetchNextPage(token: TPageToken | undefined) {
        const result = await this.fetchBaseNextPage(token);
        result.items = result.items.filter(this.predicate);
        return result;
    }
}

class CountLimitedIterableEntity<T, TPageToken>
extends WrappedIterableEntity<T, TPageToken> {
    constructor(
        base: IterableEntity<T, TPageToken>,
        private count: number,
    ) {
        super(base);

        // copy state
        this._items = base._items.slice(0, count);
        if (this._items.length < count) {
            this._nextPageToken = base._nextPageToken;
        } else {
            // we got as much as we will ever want
            this._nextPageToken = null;
        }
    }

    protected async _fetchNextPage(token: TPageToken | undefined) {
        const result = await this.fetchBaseNextPage(token);

        const remaining = this.count - this._items.length;
        result.items = result.items.slice(0, remaining);

        if (result.items.length === remaining) {
            // no more room!
            result.nextPageToken = undefined;
        }

        return result;
    }
}

/**
 * A DelegateIterable bases its implementation off another IIterableEntity,
 * but augments lazy functional methods like {@link filter} and
 * {@link take} such that they return the same instance type. This is
 * useful for types like {@link YoutubePlaylist} with have utility
 * methods that you might want to access on `filter`'d versions,
 * for example
 */
export abstract class DelegateIterable<T, TSelf> implements IIterableEntity<T, TSelf> {
    constructor(
        private base: IIterableEntity<T, any>,
        private factory: new (base: IIterableEntity<T, any>) => TSelf,
    ) { }

    public get(index: number): Promise<T> {
        return this.base.get(index);
    }

    public filter(predicate: (item: T) => boolean): TSelf {
        return new this.factory(this.base.filter(predicate));
    }

    public find(predicate: (item: T) => boolean): Promise<T | undefined> {
        return this.base.find(predicate);
    }

    public findIndex(predicate: (item: T) => boolean): Promise<number> {
        return this.base.findIndex(predicate);
    }

    public findFirstMemberOf(other: IIterableEntity<T, any>, areEqual: (a: T, b: T) => boolean): Promise<T | null> {
        return this.base.findFirstMemberOf(other, areEqual);
    }

    public slice(start?: number | undefined, end?: number | undefined): Promise<T[]> {
        return this.base.slice(start, end);
    }

    public take(count: number): TSelf {
        return new this.factory(this.base.take(count));
    }

    public [Symbol.asyncIterator](): AsyncIterator<T> {
        return this.base[Symbol.asyncIterator]();
    }

}
