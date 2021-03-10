import { ICreds } from "../creds";
import { IPage, IterableEntity } from "../iterable";
import { ISectionRenderer, Scraper } from "../scraper/polymer";

export interface IPolymerScrapingContinuation {
    url?: string;
    clickTracking: string;
    continuation: string;
}

export abstract class PolymerScrapingIterableEntity<T> extends IterableEntity<T, IPolymerScrapingContinuation> {

    /** @internal */
    public scraper: Scraper;

    constructor(
        creds: ICreds | undefined,
        private url: string,
        private scrapePage: (section: ISectionRenderer) => IPage<T, IPolymerScrapingContinuation>,
    ) {
        super();
        this.scraper = new Scraper(creds);
    }

    protected async _fetchNextPage(pageToken: IPolymerScrapingContinuation | undefined) {
        let section: ISectionRenderer;
        if (!pageToken) {
            section = await this.scraper.loadTabSectionRenderer(this.url);
        } else {
            section = await this.scraper.continueTabSectionRenderer(pageToken);
        }

        return this.scrapePage(section);
    }

}

