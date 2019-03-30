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

});
