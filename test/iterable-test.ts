import chai from "chai";

import { IterableEntity } from "../src/iterable";

// var expect = chai.expect;
chai.should();

class TestableIterable<T> extends IterableEntity<T, string> {

    public nextPageResults: Array<{ items: T[], nextPageToken?: string }> = [];

    public async _fetchNextPage(token: string | undefined) {
        const result = this.nextPageResults.shift();
        if (!result) throw new Error("Imbalance");
        return result;
    }
}

describe("IterableEntity", () => {

    let entity: TestableIterable<number>;

    beforeEach(() => {
        entity = new TestableIterable();
    });

    describe("findIndex", () => {
        it("Handles an empty entity", async () => {
            entity.nextPageResults.push({ items: [] });

            const result = await entity.findIndex(() => true);
            result.should.equal(-1);
        });

        it("findIndex over single page", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ] });

            const saw: number[] = [];
            const idx = await entity.findIndex(item => {
                saw.push(item);
                return false;
            });

            saw.should.deep.equal([1, 2, 3, 4]);
            idx.should.equal(-1);
        });
    });

    describe("async iterator", () => {
        it("handles an empty entity", async () => {
            entity.nextPageResults.push({ items: [] });

            for await (const item of entity) {
                throw new Error("Should be no items");
            }
        });

        it("iterates over single page", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ] });

            const saw = [];
            for await (const item of entity) {
                saw.push(item);
            }

            saw.should.deep.equal([1, 2, 3, 4]);
        });
    });

    describe("slice", () => {
        it("handles an empty entity", async () => {
            entity.nextPageResults.push({ items: [] });

            const sliced = await entity.slice();
            sliced.should.deep.equal([]);
        });

        it("returns the whole next page", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ] });

            const sliced = await entity.slice();
            sliced.should.deep.equal([1, 2, 3, 4]);
        });

        it("works with bounds", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ] });

            const end = await entity.slice(2);
            end.should.deep.equal([3, 4]);

            const start = await entity.slice(0, 2);
            start.should.deep.equal([1, 2]);

            const mid = await entity.slice(1, 3);
            mid.should.deep.equal([2, 3]);
        });

        it("works across page boundaries", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ], nextPageToken: "next" });
            entity.nextPageResults.push({ items: [
                5, 6, 7, 8,
            ] });

            const sliced = await entity.slice(2, 5);
            sliced.should.deep.equal([3, 4, 5]);
        });
    });

    describe("findFirstMemberOf", () => {
        it("works multiple times", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ] });

            const other = new TestableIterable<number>();
            other.nextPageResults.push({ items: [
                2, 4,
            ] });

            const areEqual = (a: number, b: number) => a === b;
            const result1 = await entity.findFirstMemberOf(other, areEqual);
            if (!result1) throw new Error();
            result1.should.equal(2);

            const result2 = await entity.findFirstMemberOf(other, areEqual);
            if (!result2) throw new Error();
            result2.should.equal(2);
        });
    });

    describe(".filter()'d ", () => {
        it("reuses original Iterable's storage", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ], nextPageToken: "next" });

            const originalNth = await entity.get(2);

            // NOTE: if we did not copy existing state,
            // we would get an "Imbalance" error on filtered.get
            // trying to make a network request
            const filtered = entity.filter(it => it < 4);
            const filteredNth = await filtered.get(2);

            filteredNth.should.equal(originalNth);
            entity._hasMore.should.be.true;
            filtered._hasMore.should.be.true;
        });

    });

    describe(".take()'d ", () => {
        it("reuses original Iterable's storage", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ], nextPageToken: "next" });

            const originalNth = await entity.get(2);

            // NOTE: if we did not copy existing state,
            // we would get an "Imbalance" error on filtered.get
            // trying to make a network request
            const taken = entity.take(3);
            const takenNth = await taken.get(2);

            takenNth.should.equal(originalNth);
            entity._hasMore.should.be.true;

            // NOTE: we already have 3
            taken._hasMore.should.be.false;
        });

        it("prevents further fetches", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ], nextPageToken: "next" });

            // taking before the original has fetched any state
            const taken = entity.take(3);
            const takenNth = await taken.get(2);
            takenNth.should.equal(3);

            // NOTE: we already have 3
            taken._hasMore.should.be.false;
            entity._hasMore.should.be.true;

        });

        it("does not break original entity's state", async () => {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4,
            ], nextPageToken: "next" });

            // taking before the original has fetched any state
            const taken = entity.take(3);
            const takenNth = await taken.get(2);
            takenNth.should.equal(3);

            // NOTE: we already have 3
            taken._hasMore.should.be.false;
            entity._hasMore.should.be.true;

            (await entity.get(3)).should.equal(4);
        });
    });
});
