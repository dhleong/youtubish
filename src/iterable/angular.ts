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
        // load the document
        const $ = !pageToken
            ? await this.scraper.scrape(this.url)
            : await this.scraper.scrapeContinuation(
                "https://www.youtube.com" + pageToken.loadMoreUrl,
                pageToken.contentElement,
                pageToken.loadMoreWidgetId,
            );

        // scrape the items:
        const page = this.scrapePage($);

        // load more is shared:
        const loadMoreButton = $(".load-more-button");
        const loadMoreUrl = loadMoreButton.attr("data-uix-load-more-href");
        const loadMoreWidgetId = loadMoreButton.attr("data-uix-load-more-target-id");
        const contentElement = loadMoreWidgetId
            ? $("#" + loadMoreWidgetId).parent().prop("tagName")
            : "div";

        if (loadMoreUrl) {
            page.nextPageToken = {
                contentElement,
                loadMoreUrl,
                loadMoreWidgetId,
            };
        }

        return page;
    }

}
