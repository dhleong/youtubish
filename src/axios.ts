import axios from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import FormData from "form-data";

const instance = axios.create();
axiosCookieJarSupport(instance);

instance.interceptors.request.use(config => {
    if (config.data instanceof FormData) {
        Object.assign(config.headers, config.data.getHeaders());
    }

    if (config.jar) {
        // if we provided a jar... use it
        config.withCredentials = true;
    }

    return config;
});

export default instance;
