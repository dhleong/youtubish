const chai = require('chai');

const { IterableEntity } = require('../lib/iterable');

// var expect = chai.expect;
chai.should();

class TestableIterable extends IterableEntity {
    constructor() {
        super();
        this.nextPageResults = [];
    }

    async _fetchNextPage() {
        return this.nextPageResults.shift();
    }
}

describe('IterableEntity', () => {

    let entity;

    beforeEach(function() {
        entity = new TestableIterable();
    });

    describe('findIndex', function() {
        it('Handles an empty entity', async function() {
            entity.nextPageResults.push({ items: [] });

            const result = await entity.findIndex(() => true);
            result.should.equal(-1);
        });

        it('findIndex over single page', async function() {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4
            ] });

            const saw = [];
            const idx = await entity.findIndex((item) => {
                saw.push(item);
                return false;
            });

            saw.should.deep.equal([1, 2, 3, 4]);
            idx.should.equal(-1);
        });
    });

    describe('async iterator', function() {
        it('handles an empty entity', async function() {
            entity.nextPageResults.push({ items: [] });

            for await (const item of entity) {
                throw new Error('Should be no items');
            }
        });

        it('iterates over single page', async function() {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4
            ] });

            const saw = [];
            for await (const item of entity) {
                saw.push(item);
            }

            saw.should.deep.equal([1, 2, 3, 4]);
        });
    });

    describe('slice', function() {
        it('handles an empty entity', async function() {
            entity.nextPageResults.push({ items: [] });

            const sliced = await entity.slice();
            sliced.should.deep.equal([]);
        });

        it('returns the whole next page', async function() {
            entity.nextPageResults.push({ items: [
                1, 2, 3, 4
            ] });

            const sliced = await entity.slice();
            sliced.should.deep.equal([1, 2, 3, 4]);
        });
    });

});
