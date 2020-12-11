import Auth from './Auth'
import { byteSize, uriEncode, normalizePath } from './strings'
import HttpClient from './HttpClient'
import EventBus from './EventBus'
import { pick, pickBy } from './utils'
import {
    X_BCE_DATE,
    CONTENT_LENGTH,
    CONTENT_ENCODING,
    CONTENT_MD5,
    X_BCE_CONTENT_SHA256,
    CONTENT_TYPE,
    CONTENT_DISPOSITION,
    ETAG,
    SESSION_TOKEN,
    CACHE_CONTROL,
    EXPIRES,
    X_BCE_ACL,
    X_BCE_GRANT_READ,
    X_BCE_GRANT_FULL_CONTROL,
    X_BCE_OBJECT_ACL,
    X_BCE_OBJECT_GRANT_READ,
    X_CODE,
    X_STATUS_CODE
} from './headers'

const MAX_PUT_OBJECT_LENGTH = 5368709120 // 5G
const MAX_USER_METADATA_SIZE = 2048 // 2 * 1024
// const MIN_PART_NUMBER = 1
// const MAX_PART_NUMBER = 10000
// const MAX_RETRY_COUNT = 3

const allowedHeaders = [
    CONTENT_LENGTH,
    CONTENT_ENCODING,
    CONTENT_MD5,
    X_BCE_CONTENT_SHA256,
    CONTENT_TYPE,
    CONTENT_DISPOSITION,
    ETAG,
    SESSION_TOKEN,
    CACHE_CONTROL,
    EXPIRES,
    X_BCE_ACL,
    X_BCE_GRANT_READ,
    X_BCE_GRANT_FULL_CONTROL,
    X_BCE_OBJECT_ACL,
    X_BCE_OBJECT_GRANT_READ
]

const defaultRequestArgs = {
    bucketName: null,
    key: null,
    body: null,
    headers: {},
    params: {},
    config: {}
}

export default class BosClient extends EventBus {
    constructor (config) {
        super()
        this.config = config
    }

    createSignature (credentials, httpMethod, path, params, headers) {
        const revisionTimestamp = Date.now() + (this.timeOffset || 0)
        headers[X_BCE_DATE] = new Date(revisionTimestamp).toISOString().replace(/\.\d+Z$/, 'Z')

        const auth = new Auth(credentials.ak, credentials.sk)
        return auth.generateAuthorization(httpMethod, path, params, headers, new Date(revisionTimestamp))
    }

    generateUrl (bucketName, key) {
        const resource = normalizePath([
            '/v1',
            uriEncode(bucketName || ''),
            uriEncode(key || '', false)
        ].join('/'))
        return this.config.endpoint + resource
    }

    putObject (bucketName, key, data, options = {}) {
        if (!key) {
            throw new TypeError('key should not be empty.')
        }

        options = this._checkOptions(options)

        return this.sendRequest('PUT', {
            bucketName: bucketName,
            key: key,
            body: data,
            headers: options.headers,
            config: options.config
        })
    }

    putObjectFromBlob (bucketName, key, blob, options) {
        const headers = {}

        headers[CONTENT_LENGTH] = blob.size

        // 对于浏览器调用API的时候，默认不添加 CONTENT_MD5 字段，因为计算起来比较慢
        // 而且根据 API 文档，这个字段不是必填的。
        options = Object.assign({}, headers, options)

        return this.putObject(bucketName, key, blob, options)
    }

    sendRequest (httpMethod, varArgs) {
        const args = Object.assign({}, defaultRequestArgs, varArgs)
        const config = Object.assign({}, this.config, args.config)

        const resource = normalizePath([
            '/v1',
            /\.[\w-]+\.bcebos\.com$/.test(config.endpoint) ? '' : uriEncode(args.bucketName || ''),
            uriEncode(args.key || '', false)
        ].join('/'))

        if (config.sessionToken) {
            args.headers[SESSION_TOKEN] = config.sessionToken
        }

        return this.sendHTTPRequest(httpMethod, resource, args, config)
    }

    sendHTTPRequest (httpMethod, resource, args, config) {
        const httpContext = {
            httpMethod: httpMethod,
            resource: resource,
            args: args,
            config: config
        }

        const doRequest = () => {
            const agent = new HttpClient(config)
            agent.on('progress', evt => this.emit('progress', evt, httpContext))
            this.cancelRequest = agent.cancelRequest.bind(agent)

            const promise = agent.sendRequest(
                httpMethod, resource, args.body, args.headers, args.params,
                this.createSignature.bind(this)
            )
            promise.abort = this.cancelRequest
            return promise
        }

        return doRequest().catch(err => {
            const serverTimestamp = new Date(err[X_BCE_DATE]).getTime()

            this.timeOffset = serverTimestamp - Date.now()

            if (err[X_STATUS_CODE] === 403 && err[X_CODE] === 'RequestTimeTooSkewed') {
                return doRequest()
            }

            if (typeof err.message !== 'string') {
                err.message = `Unknown error. (${err[X_STATUS_CODE]})`
            }
            throw err
        })
    };

    _checkOptions (options, allowedParams) {
        return {
            config: options.config || {},
            headers: this._prepareObjectHeaders(options),
            params: pick(options, allowedParams || [])
        }
    };

    _prepareObjectHeaders (options) {
        const headers = pickBy(options, (value, key) => (allowedHeaders.indexOf(key) > -1) || String.prototype.startsWith.call(key, 'x-bce-meta-'))
        const metaSize = Object.entries(headers).reduce((ret, [key, value]) => {
            return String.prototype.startsWith.call(key, 'x-bce-meta-') ? ret + byteSize(key + '' + value) : ret
        }, 0)

        if (metaSize > MAX_USER_METADATA_SIZE) {
            throw new TypeError(`Metadata size should not be greater than ${MAX_USER_METADATA_SIZE}.`)
        }

        if (headers[CONTENT_LENGTH]) {
            const contentLength = headers[CONTENT_LENGTH]
            if (contentLength < 0) {
                throw new TypeError('content_length should not be negative.')
            } else if (contentLength > MAX_PUT_OBJECT_LENGTH) { // 5G
                // eslint-disable-next-line max-len
                throw new TypeError(`Object length should be less than ${MAX_PUT_OBJECT_LENGTH}. Use multi-part upload instead.`)
            }
        }

        if (headers.ETag) {
            const etag = headers.ETag
            if (!/^"/.test(etag)) {
                headers.ETag = `"${etag}"`
            }
        }

        if (!headers[CONTENT_TYPE]) {
            headers[CONTENT_TYPE] = 'application/octet-stream'
        }

        return headers
    }

    // initiateMultipartUpload(bucketName, key, options) {
    //     options = options || {};

    //     var headers = {};
    //     headers[H.CONTENT_TYPE] = MimeType.guess(path.extname(key));

    //     options = this._checkOptions(u.extend(headers, options));

    //     return this.sendRequest('POST', {
    //         bucketName: bucketName,
    //         key: key,
    //         params: {uploads: ''},
    //         headers: options.headers,
    //         config: options.config
    //     });
    // }

    // abortMultipartUpload(bucketName, key, uploadId, options) {
    //     options = options || {};

    //     return this.sendRequest('DELETE', {
    //         bucketName: bucketName,
    //         key: key,
    //         params: {uploadId: uploadId},
    //         config: options.config
    //     });
    // }

    // completeMultipartUpload(bucketName, key, uploadId, partList, options) {
    //     var headers = {};
    //     headers[H.CONTENT_TYPE] = 'application/json; charset=UTF-8';
    //     options = this._checkOptions(u.extend(headers, options));

    //     return this.sendRequest('POST', {
    //         bucketName: bucketName,
    //         key: key,
    //         body: JSON.stringify({parts: partList}),
    //         headers: options.headers,
    //         params: {uploadId: uploadId},
    //         config: options.config
    //     });
    // }

    // uploadPartFromBlob(bucketName, key, uploadId, partNumber,
    //                                                    partSize, blob, options) {
    //     if (blob.size !== partSize) {
    //         throw new TypeError(util.format('Invalid partSize %d and data length %d',
    //             partSize, blob.size));
    //     }

    //     var headers = {};
    //     headers[H.CONTENT_LENGTH] = partSize;
    //     headers[H.CONTENT_TYPE] = 'application/octet-stream';
    //     // 对于浏览器调用API的时候，默认不添加 H.CONTENT_MD5 字段，因为计算起来比较慢
    //     // headers[H.CONTENT_MD5] = require('./crypto').md5sum(data);

    //     options = this._checkOptions(u.extend(headers, options));
    //     return this.sendRequest('PUT', {
    //         bucketName: bucketName,
    //         key: key,
    //         body: blob,
    //         headers: options.headers,
    //         params: {
    //             partNumber: partNumber,
    //             uploadId: uploadId
    //         },
    //         config: options.config
    //     });
    // }

    // listParts(bucketName, key, uploadId, options) {
    //     /* eslint-disable */
    //     if (!uploadId) {
    //         throw new TypeError('uploadId should not empty');
    //     }
    //     /* eslint-enable */

    //     var allowedParams = ['maxParts', 'partNumberMarker', 'uploadId'];
    //     options = this._checkOptions(options || {}, allowedParams);
    //     options.params.uploadId = uploadId;

    //     return this.sendRequest('GET', {
    //         bucketName: bucketName,
    //         key: key,
    //         params: options.params,
    //         config: options.config
    //     });
    // }
}
