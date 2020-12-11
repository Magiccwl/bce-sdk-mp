import axios from 'axios';
import EventBus from './EventBus';
import {
    AUTHORIZATION,
    CONTENT_TYPE,
    X_BCE_DATE,
    X_CODE,
    X_STATUS_CODE,
    X_MESSAGE,
    X_HTTP_HEADERS,
    X_BODY
} from './headers';


export default class HttpClient extends EventBus {
    constructor(config) {
        super();
        this.config = config;

        this._client = axios.create({
            baseURL: this.config.endpoint,
            headers: {
                [CONTENT_TYPE]: 'application/json; charset=UTF-8',
            },
            onUploadProgress: this.updateProgress.bind(this),
        });
    }

    sendRequest(httpMethod, path, body, headers, params, signFunction) {
        httpMethod = httpMethod.toUpperCase();

        let options = {
            url: path,
            method: httpMethod,
            params,
        };

        // Prepare the request headers.
        options.headers = {
            ...headers,
            [X_BCE_DATE]: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        };

        if (typeof signFunction === 'function') {
            options.headers[AUTHORIZATION] = signFunction(this.config.credentials, httpMethod, path, params, headers);
        }
        else {
            options.headers[AUTHORIZATION] = createSignature(this.config.credentials, httpMethod, path, params, headers);
        }

        // TODO: unsafe headers 处理
        // bce-sdk-js 用的 http(s)-browserify 里面搞了过滤如果是 unsafe 头就不调用 setRequestHeader
        // 但是 axios 里面没有处理这个，导致会触发一个 console 报错（但不影响功能），要隐藏这个报错的话就也要实现下这个
        // https://github.com/browserify/http-browserify/blob/17b2990010ebd39461d1117c1e2c50c25eab869f/lib/request.js#L44
        // https://github.com/axios/axios/blob/ffea03453f77a8176c51554d5f6c3c6829294649/lib/adapters/xhr.js#L132
        return this._doRequest(options, body);
    }

    async _doRequest(options, body) {
        let response;
        try {
            response = await this._client.request({
                ...options,
                data: body,
                responseType: 'text',
                cancelToken: new axios.CancelToken(cancel => {
                    this._cancelRequest = cancel;
                }),
            });
        }
        catch(error) {
            if (!error.response) {
                return Promise.reject(error);
            }

            let {status, data, headers} = error.response;
            if (status >= 100 && status < 200) {
                return Promise.reject(failure(status, 'Can not handle 1xx http status code.'));
            }
            else if (status < 100 || status >= 300) {
                let responseBody;
                try {
                    responseBody = parseHttpResponseBody(data, headers);
                }
                catch (err) {};
                if (responseBody.requestId) {
                    let {message, code, requestId} = responseBody;
                    return Promise.reject(failure(status, message, code, requestId, headers.date));
                }
                else {
                    return Promise.reject(failure(status, responseBody));
                }
            }
            return Promise.reject(failure(error.response.status, error.message));
        }

        let data;
        try {
            data = parseHttpResponseBody(response.data, response.headers);
        }
        catch (error) {
            return Promise.reject(failure(response.status, error.message));
        }

        return success(fixHeaders(response.headers), data);
    }

    cancelRequest(...args) {
        if (this._cancelRequest) {
            this._cancelRequest(...args);
        }
    }

    updateProgress(progressEvent) {
        this.emit('progress', progressEvent);
    }

}

function createSignature(credentials, httpMethod, path, params, headers) {
    let auth = new Auth(credentials.ak, credentials.sk);
    return auth.generateAuthorization(httpMethod, path, params, headers);
}

function fixHeaders(headers = {}) {
    return Object.entries(headers).reduce(function (ret, [key, value]) {
        value = value.trim();
        if (value) {
            key = key.toLowerCase();
            if (key === 'etag') {
                value = value.replace(/"/g, '');
            }
            ret[key] = value;
        }
        return ret;
    }, {});
}


function success(httpHeaders, body) {
    return {
        [X_HTTP_HEADERS]: httpHeaders,
        [X_BODY]: body,
    };
}

function failure(statusCode, message, code, requestId, xBceDate) {
    let response = {
        [X_STATUS_CODE]: statusCode,
        [X_MESSAGE]: message,
    };

    if (code) {
        response[X_CODE] = code;
    }
    if (requestId) {
        response[X_REQUEST_ID] = requestId;
    }
    if (xBceDate) {
        response[X_BCE_DATE] = xBceDate;
    }

    return response;
}

function parseHttpResponseBody(raw, headers) {
    var contentType = headers['content-type'];

    if (!raw.length) {
        return {};
    }
    else if (contentType && /^(application|text)\/json$/i.test(contentType)) {
        return JSON.parse(raw);
    }
    return raw;
}
