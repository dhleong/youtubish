import _debug from "debug";
const debug = _debug("youtubish:login");

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Cookie } from "tough-cookie";

import { generateAuthCodeUrl, exchangeAuthCode } from "./auth";

/*
 * NOTE: This process is largely based on the same for yakyak:
 *
 * https://github.com/yakyak/yakyak/blob/master/src/login.coffee
 *
 * Big thanks to the folks there for coming up with this process!
 */

export async function requestAuthCode() {
    debug("launching browser...");
    const browser = await puppeteer.use(StealthPlugin()).launch({
        headless: false,
        dumpio: debug.enabled,
    });

    const [
        existingPages,
        page
    ] = await Promise.all([
        browser.pages(),
        browser.newPage(),
    ]);

    // just slightly cleaner UX:
    if (existingPages.length === 1 && existingPages[0].url() === "about:blank") {
        existingPages[0].close();
    }

    try {
        debug("opening auth code request url...");
        await page.goto(generateAuthCodeUrl());
        await page.waitForNavigation({
            timeout: 0,
        });

        debug("waiting for auth result...");
        const response = await page.waitForResponse(req => {
            return req.url().includes("/o/oauth2/programmatic_auth");
        }, {
            timeout: 0,
        });

        debug("auth'd!");
        const headers = response.headers();
        const setCookie = headers["set-cookie"];
        if (!setCookie) {
            throw new Error("No cookies found");
        }

        const cookies = setCookie.split("\n").map(raw => Cookie.parse(raw));
        for (const cookie of cookies) {
            if (!cookie) continue;
            if (cookie.key === "oauth_code") {
                return cookie.value;
            }
        }

        throw new Error("oauth code not found");

    } finally {
        await browser.close();
    }
}

export async function requestCreds() {
    const authCode = await requestAuthCode();
    return exchangeAuthCode(authCode);
}
