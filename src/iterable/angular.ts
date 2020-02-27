import { ICreds } from "../creds";
import { IPage, IterableEntity } from "../iterable";
import { AngularScraper } from "../scraper/angular";

export interface IAngularScrapingContinuation {
    contentElement: string;
    loadMoreUrl: string;
    loadMoreWidgetId?: string;
}

export abstract class AngularScrapingIterableEntity<T> extends IterableEntity<T, IAngularScrapingContinuation> {

    /** @internal */
    public scraper: AngularScraper;

    constructor(
        creds: ICreds | undefined,
        private url: string,
        private scrapePage: ($: CheerioStatic) => IPage<T, IAngularScrapingContinuation>,
    ) {
        super();
        this.scraper = new AngularScraper(creds);
    }

    protected async _fetchNextPage(pageToken: IAngularScrapingContinuation | undefined) {
        if (!pageToken) {
            const $ = await this.scraper.scrape(this.url);
            return this.scrapePage($);
        } else {
            const $ = await this.scraper.scrapeContinuation(
                "https://www.youtube.com" + pageToken.loadMoreUrl,
                pageToken.contentElement,
                pageToken.loadMoreWidgetId,
            );
            return this.scrapePage($);
        }
    }

}
