import chai from "chai";

import { IterableEntity } from "../src/iterable";

// var expect = chai.expect;
chai.should();

class TestableIterable<T> extends IterableEntity<T> {

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
    });

});
