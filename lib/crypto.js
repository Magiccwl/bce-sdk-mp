import {hmac} from 'fast-sha256';

function i2hex(i) {
    return ('0' + i.toString(16)).slice(-2);
}

// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
function stringToUint8Array(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return bufView;
}

function uint8ArrayToString(uint8) {
    return uint8.reduce(function(memo, i) {return memo + i2hex(i)}, '');
}

export function sha256hmac(key, data) {
    // var crypto = require('crypto');
    // var sha256Hmac = crypto.createHmac('sha256', key);
    // sha256Hmac.update(data);
    // return sha256Hmac.digest('hex');

    let d = hmac(stringToUint8Array(key), stringToUint8Array(data));
    return uint8ArrayToString(d);
}
