const kEscapedMap = {
    '!': '%21',
    '\'': '%27',
    '(': '%28',
    ')': '%29',
    '*': '%2A'
};

export function uriEncode(string, encodingSlash = true) {
    let result = encodeURIComponent(string);
    result = result.replace(/[!'\(\)\*]/g, function ($1) {
        return kEscapedMap[$1];
    });

    if (!encodingSlash) {
        result = result.replace(/%2F/gi, '/');
    }

    return result;
}

export function byteSize(str) {
    // https://dev.to/rajnishkatharotiya/get-byte-size-of-the-string-in-javascript-20jm
    return new Blob([str]).size;
}

export function normalizePath(str) {
    let parts = str.split('/');
    let i = 0;
    let ret = parts.reduce(function (ret, part) {
        part = part.trim();
        if (/^\.{2,}$/.test(part)) {
            i = Math.max(0, i - 1);
        }
        else if (part && part !== '.') {
            ret[i++] = part;
        }
        return ret;
    }, []);
    ret = ret.slice(0, i);
    return `/${ret.join('/')}`;
}


