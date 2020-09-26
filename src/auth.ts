import _debug from "debug";
const debug = _debug("youtubish:auth");

import { stringify as stringifyQuery } from "querystring";
import { CookieJar } from "tough-cookie";

import axios from "./axios";
import { formDataFrom } from "./util";

/*
 * NOTE: This process is largely based on the same for yakyak:
 *
 * https://github.com/yakyak/hangupsjs/blob/master/src/auth.coffee
 *
 * Big thanks to the folks there for coming up with this process!
 */

const YOUTUBE = "https://youtube.com";

const OAUTH2_CLIENT_ID = "936475272427.apps.googleusercontent.com";
const OAUTH2_CLIENT_SECRET = "KWsJlkaMn1jGLxQpWxMnOox-";
const OAUTH2_SCOPE = [
    "https://www.google.com/accounts/OAuthLogin",
    "https://www.googleapis.com/auth/userinfo.email",
];
const OAUTH2_DELEGATED = "183697946088-m3jnlsqshjhh5lbvg05k46q1k4qqtrgn.apps.googleusercontent.com";

const OAUTH2_LOGIN_URL = "https://accounts.google.com/o/oauth2/programmatic_auth";
const OAUTH2_TOKEN_REQUEST_URL = "https://accounts.google.com/o/oauth2/token";

const UBERAUTH = "https://accounts.google.com/accounts/OAuthLogin?source=hangups&issueuberauth=1";
const MERGE_SESSION = "https://accounts.google.com/MergeSession";
const MERGE_SESSION_ARGS = {
    continue: "http://www.google.com",
    service: "youtube",
};

interface IRawAccessInfo {
    access_token: string,
    expires_in: number, // in seconds
    scope: string,
    token_type: "Bearer",
    id_token: string,
}

export interface IAccessInfo {
    token: string,
    expiresAt: number,
    scope: string,
}

function parseRawAccess(raw: IRawAccessInfo) {
    const info: IAccessInfo = {
        token: raw.access_token,
        expiresAt: Date.now() + raw.expires_in * 1000,
        scope: raw.scope,
    }
    return info;
}

export function generateAuthCodeUrl() {
    return OAUTH2_LOGIN_URL + "?" + stringifyQuery({
        access_type: "offline",
        client_id: OAUTH2_CLIENT_ID,
        delegated_client_id: OAUTH2_DELEGATED,
        hl: "en",
        scope: OAUTH2_SCOPE.join(" "),
        top_level_cookie: "1",
    });
}

export async function exchangeAuthCode(
    code: string,
) {
    const { data } = await axios.post(
        OAUTH2_TOKEN_REQUEST_URL,
        formDataFrom({
            client_id: OAUTH2_CLIENT_ID,
            client_secret: OAUTH2_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri:  'urn:ietf:wg:oauth:2.0:oob'
        }),
    );

    debug("successfully exchanged authCode for auth tokens");
    return {
        refreshToken: data.refresh_token,
        access: parseRawAccess(data),
    };
}

export async function exchangeRefreshTokenForAccessToken(
    refreshToken: string,
) {
    const { data } = await axios.post(
        OAUTH2_TOKEN_REQUEST_URL,
        formDataFrom({
            client_id: OAUTH2_CLIENT_ID,
            client_secret: OAUTH2_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    );

    debug("successfully exchanged refreshToken for accessToken");
    return parseRawAccess(data);
};

export async function createCookiesForAccessToken(
    access: string | IAccessInfo,
) {
    const jar = new CookieJar();

    const accessToken = typeof access === "string"
        ? access
        : access.token;

    debug("generate uberauth from accessToken...");
    const { data: uberauth } = await axios.get(UBERAUTH, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    // this step "warms up" the cookies (maybe)
    await axios.get(MERGE_SESSION, { jar });

    debug("generate google web cookies...");
    await axios.get(MERGE_SESSION, {
        params: {
            ...MERGE_SESSION_ARGS,
            uberauth,
        },

        jar,
    });

    debug("fetch youtube-specific auth cookies...");
    await axios.get(YOUTUBE, { jar });

    return jar.getCookieString(YOUTUBE);
}
