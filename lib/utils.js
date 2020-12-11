import createError from 'axios/lib/core/createError'

// It replaces pick in lodash
export function pick (object, keys) {
    return keys.reduce((obj, key) => {
        if (object && Object.prototype.hasOwnProperty.call(object, 'bar')) {
            obj[key] = object[key]
        }
        return obj
    }, {})
}

// It replaces pickBy in lodash
export function pickBy (object) {
    const obj = {}
    for (const key in object) {
        if (object[key]) {
            obj[key] = object[key]
        }
    }
    return obj
}

// It replaces fromPairs in lodash
export function fromPairs (arr) {
    return arr.reduce(function (accumulator, value) {
        accumulator[value[0]] = value[1]
        return accumulator
    }, {})
}

/**
 * These codes below were made by bigmeow. Ref: https://github.com/bigmeow/axios-miniprogram-adapter.
 *
 */

let platFormName = 'baidu'

/**
 * 获取各个平台的请求函数
 */
export function getRequest () {
    switch (true) {
    case typeof wx === 'object':
        platFormName = 'wechat'
        return wx.request.bind(wx)
    case typeof swan === 'object':
        platFormName = 'baidu'
        return swan.request.bind(swan)
    case typeof my === 'object':
        /**
             * remark:
             * 支付宝客户端已不再维护 my.httpRequest，建议使用 my.request。另外，钉钉客户端尚不支持 my.request。若在钉钉客户端开发小程序，则需要使用 my.httpRequest。
             * my.httpRequest的请求头默认值为{'content-type': 'application/x-www-form-urlencoded'}。
             * my.request的请求头默认值为{'content-type': 'application/json'}。
             * TODO: 区分支付宝和钉钉环境
             * 还有个 dd.httpRequest   WFK!!! https://ding-doc.dingtalk.com/doc#/dev/httprequest
             */
        platFormName = 'alipay'
        return (my.request || my.httpRequest).bind(my)
    case typeof window === 'object' && typeof document === 'object':
        platFormName = 'browser'
        return null // use axios's request by default.
    default:
        return wx.request.bind(wx)
    }
}

/**
 * 处理各平台返回的响应数据，抹平差异
 * @param mpResponse
 * @param config axios处理过的请求配置对象
 * @param request 小程序的调用发起请求时，传递给小程序api的实际配置
 */
export function transformResponse (mpResponse, config, mpRequestOption) {
    const headers = mpResponse.header || mpResponse.headers
    const status = mpResponse.statusCode || mpResponse.status

    let statusText = ''
    if (status === 200) {
        statusText = 'OK'
    } else if (status === 400) {
        statusText = 'Bad Request'
    }

    const response = {
        data: mpResponse.data,
        status,
        statusText,
        headers,
        config,
        request: mpRequestOption
    }
    return response
}

/**
 * 处理各平台返回的错误信息，抹平差异
 * @param error 小程序api返回的错误对象
 * @param reject 上层的promise reject 函数
 * @param config
 */
export function transformError (error, reject, config) {
    switch (platFormName) {
    case 'wechat':
        if (error.errMsg.indexOf('request:fail abort') !== -1) {
            // Handle request cancellation (as opposed to a manual cancellation)
            reject(createError('Request aborted', config, 'ECONNABORTED', ''))
        } else if (error.errMsg.indexOf('timeout') !== -1) {
            // timeout
            reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED', ''))
        } else {
            // NetWordError
            reject(createError('Network Error', config, null, ''))
        }
        break
    case 'alipay':
        // https://docs.alipay.com/mini/api/network
        if ([14, 19].includes(error.error)) {
            reject(createError('Request aborted', config, 'ECONNABORTED', ''))
        } else if ([13].includes(error.error)) {
            // timeout
            reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED', ''))
        } else {
            // NetWordError
            reject(createError('Network Error', config, null, ''))
        }
        break
    case 'baidu':
        // TODO error.errCode
        reject(createError('Network Error', config, null, ''))
        break
    }
}

/**
 * 将axios的请求配置，转换成各个平台都支持的请求config
 * @param config
 */
export function transformConfig (config) {
    if (platFormName === 'alipay') {
        config.headers = config.header
        delete config.header
    }
    return config
}
