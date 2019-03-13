const fs = require('fs');
const util = require('util');

const readFileAsync = util.promisify(fs.readFile);

class Credentials {
    constructor(apiKey, cookies) {
        this.apiKey = apiKey;
        this.cookies = cookies;
    }
}

function asyncLambda(value) {
    return async () => value;
}

function fileReader(file) {
    return () => readFileAsync(file);
}

function curlParser(input) {
    return async () => {
        const rawCurl = await input();
        const curlString = rawCurl.toString();
        const [ , cookies ] = curlString.match(/'cookie: (.*?)'/);
        return cookies;
    };
}

class CredentialsBuilder {

    apiKey(key) {
        this._apiKey = asyncLambda(key);
        return this;
    }

    apiKeyFromFile(file) {
        this._apiKey = fileReader(file);
        return this;
    }

    cookies(cookies) {
        this._cookies = asyncLambda(cookies);
        return this;
    }

    cookiesFromFile(file) {
        this._cookies = fileReader(file);
        return this;
    }

    cookiesFromCurl(curlString) {
        this._cookies = curlParser(asyncLambda(curlString));
        return this;
    }

    cookiesFromCurlFile(curlString) {
        this._cookies = curlParser(fileReader(curlString));
        return this;
    }

    async build() {
        if (!this._apiKey) throw new Error('No API key provided');
        if (!this._cookies) throw new Error('No cookies provided');

        const [ apiKey, cookies ] = await Promise.all([
            this._apiKey(), this._cookies(),
        ]);
        return new Credentials(apiKey, cookies);
    }
}

module.exports = {
    Credentials,
    CredentialsBuilder,
};
