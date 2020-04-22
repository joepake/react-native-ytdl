const url = require('url');
import FORMATS from './formats';


// Use these to help sort formats, higher is better.
const audioEncodingRanks = [
    'mp4a',
    'mp3',
    'vorbis',
    'aac',
    'opus',
    'flac',
];
const videoEncodingRanks = [
    'mp4v',
    'avc1',
    'Sorenson H.283',
    'MPEG-4 Visual',
    'VP8',
    'VP9',
    'H.264',
];

const getBitrate = (format) => parseInt(format.bitrate) || 0;
const audioScore = (format) => {
    const abitrate = format.audioBitrate || 0;
    const aenc = audioEncodingRanks.findIndex(enc => format.codecs && format.codecs.includes(enc));
    return abitrate + aenc / 10;
};


/**
 * Sort formats from highest quality to lowest.
 * By resolution, then video bitrate, then audio bitrate.
 *
 * @param {Object} a
 * @param {Object} b
 */
exports.sortFormats = (a, b) => {
    const ares = a.qualityLabel ? parseInt(a.qualityLabel.slice(0, -1)) : 0;
    const bres = b.qualityLabel ? parseInt(b.qualityLabel.slice(0, -1)) : 0;
    const afeats = ~~!!ares * 2 + ~~!!a.audioBitrate;
    const bfeats = ~~!!bres * 2 + ~~!!b.audioBitrate;

    if (afeats === bfeats) {
        if (ares === bres) {
            let avbitrate = getBitrate(a);
            let bvbitrate = getBitrate(b);
            if (avbitrate === bvbitrate) {
                let aascore = audioScore(a);
                let bascore = audioScore(b);
                if (aascore === bascore) {
                    const avenc = videoEncodingRanks.findIndex(enc => a.codecs && a.codecs.includes(enc));
                    const bvenc = videoEncodingRanks.findIndex(enc => b.codecs && b.codecs.includes(enc));
                    return bvenc - avenc;
                } else {
                    return bascore - aascore;
                }
            } else {
                return bvbitrate - avbitrate;
            }
        } else {
            return bres - ares;
        }
    } else {
        return bfeats - afeats;
    }
};


/**
 * Choose a format depending on the given options.
 *
 * @param {Array.<Object>} formats
 * @param {Object} options
 * @return {Object|Error}
 */
exports.chooseFormat = (formats, options) => {
    if (typeof options.format === 'object') {
        return options.format;
    }

    if (options.filter) {
        formats = exports.filterFormats(formats, options.filter);
        if (formats.length === 0) {
            return Error('No formats found with custom filter');
        }
    }

    let format;
    const quality = options.quality || 'highest';
    switch (quality) {
        case 'highest':
            format = formats[0];
            break;

        case 'lowest':
            format = formats[formats.length - 1];
            break;

        case 'highestaudio':
            formats = exports.filterFormats(formats, 'audio');
            format = null;
            for (let f of formats) {
                if (!format
                    || audioScore(f) > audioScore(format))
                    format = f;
            }
            break;

        case 'lowestaudio':
            formats = exports.filterFormats(formats, 'audio');
            format = null;
            for (let f of formats) {
                if (!format
                    || audioScore(f) < audioScore(format))
                    format = f;
            }
            break;

        case 'highestvideo':
            formats = exports.filterFormats(formats, 'video');
            format = null;
            for (let f of formats) {
                if (!format
                    || getBitrate(f) > getBitrate(format))
                    format = f;
            }
            break;

        case 'lowestvideo':
            formats = exports.filterFormats(formats, 'video');
            format = null;
            for (let f of formats) {
                if (!format
                    || getBitrate(f) < getBitrate(format))
                    format = f;
            }
            break;

        default: {
            let getFormat = (itag) => {
                return formats.find((format) => '' + format.itag === '' + itag);
            };
            if (Array.isArray(quality)) {
                quality.find((q) => format = getFormat(q));
            } else {
                format = getFormat(quality);
            }
        }

    }

    if (!format) {
        return Error('No such format found: ' + quality);
    }
    return format;
};


/**
 * @param {Array.<Object>} formats
 * @param {Function} filter
 * @return {Array.<Object>}
 */
exports.filterFormats = (formats, filter) => {
    let fn;
    const hasVideo = format => !!format.qualityLabel;
    const hasAudio = format => !!format.audioBitrate;
    switch (filter) {
        case 'audioandvideo':
            fn = (format) => hasVideo(format) && hasAudio(format);
            break;

        case 'video':
            fn = hasVideo;
            break;

        case 'videoonly':
            fn = (format) => hasVideo(format) && !hasAudio(format);
            break;

        case 'audio':
            fn = hasAudio;
            break;

        case 'audioonly':
            fn = (format) => !hasVideo(format) && hasAudio(format);
            break;

        default:
            if (typeof filter === 'function') {
                fn = filter;
            } else {
                throw TypeError(`Given filter (${filter}) is not supported`);
            }
    }
    return formats.filter(fn);
};


/**
 * String#indexOf() that supports regex too.
 *
 * @param {string} haystack
 * @param {string|RegExp} needle
 * @return {number}
 */
const indexOf = (haystack, needle) => {
    return needle instanceof RegExp ?
        haystack.search(needle) : haystack.indexOf(needle);
};


/**
 * Extract string inbetween another.
 *
 * @param {string} haystack
 * @param {string} left
 * @param {string} right
 * @return {string}
 */
exports.between = (haystack, left, right) => {
    let pos = indexOf(haystack, left);
    if (pos === -1) { return ''; }
    haystack = haystack.slice(pos + left.length);
    pos = indexOf(haystack, right);
    if (pos === -1) { return ''; }
    haystack = haystack.slice(0, pos);
    return haystack;
};


/**
 * Get video ID.
 *
 * There are a few type of video URL formats.
 *  - https://www.youtube.com/watch?v=VIDEO_ID
 *  - https://m.youtube.com/watch?v=VIDEO_ID
 *  - https://youtu.be/VIDEO_ID
 *  - https://www.youtube.com/v/VIDEO_ID
 *  - https://www.youtube.com/embed/VIDEO_ID
 *  - https://music.youtube.com/watch?v=VIDEO_ID
 *  - https://gaming.youtube.com/watch?v=VIDEO_ID
 *
 * @param {string} link
 * @return {string|Error}
 */
const validQueryDomains = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'gaming.youtube.com',
]);
// const validPathDomains = new Set([
//     'youtu.be',
//     'youtube.com',
//     'www.youtube.com',
// ]);
const validPathDomains = /^https?:\/\/(youtu\.be\/|(www\.)?youtube.com\/(embed|v)\/)/;

exports.getURLVideoID = (link) => {
    const parsed = url.parse(link, true);
    let id = parsed.query.v;
    // if (validPathDomains.has(parsed.hostname) && !id) {
    if (validPathDomains.test(link) && !id) {   
        const paths = parsed.pathname.split('/');
        id = paths[paths.length - 1];
    } else if (parsed.hostname && !validQueryDomains.has(parsed.hostname)) {
        return Error('Not a YouTube domain');
    }
    if (!id) {
        return Error('No video id found: ' + link);
    }
    id = id.substring(0, 11);
    if (!exports.validateID(id)) {
        return TypeError(`Video id (${id}) does not match expected ` +
            `format (${idRegex.toString()})`);
    }
    return id;
};


/**
 * Gets video ID either from a url or by checking if the given string
 * matches the video ID format.
 *
 * @param {string} str
 * @return {string|Error}
 */
exports.getVideoID = (str) => {
    if (exports.validateID(str)) {
        return str;
    } else {
        return exports.getURLVideoID(str);
    }
};


/**
 * Returns true if given id satifies YouTube's id format.
 *
 * @param {string} id
 * @return {boolean}
 */
const idRegex = /^[a-zA-Z0-9-_]{11}$/;
exports.validateID = (id) => {
    return idRegex.test(id);
};


/**
 * Checks wether the input string includes a valid id.
 *
 * @param {string} string
 * @return {boolean}
 */
exports.validateURL = (string) => {
    return !(exports.getURLVideoID(string) instanceof Error);
};


/**
 * @param {Object} format
 * @return {Object}
 */
exports.addFormatMeta = (format) => {
    format = Object.assign({}, FORMATS[format.itag], format);
    format.container = format.mimeType ?
        format.mimeType.split(';')[0].split('/')[1] : null;
    format.codecs = format.mimeType ?
        exports.between(format.mimeType, 'codecs="', '"') : null;
    format.live = /\/source\/yt_live_broadcast\//.test(format.url);
    format.isHLS = /\/manifest\/hls_(variant|playlist)\//.test(format.url);
    format.isDashMPD = /\/manifest\/dash\//.test(format.url);
    return format;
};


/**
 * Get only the string from an HTML string.
 *
 * @param {string} html
 * @return {string}
 */
exports.stripHTML = (html) => {
    return html
        .replace(/[\n\r]/g, ' ')
        .replace(/\s*<\s*br\s*\/?\s*>\s*/gi, '\n')
        .replace(/<\s*\/\s*p\s*>\s*<\s*p[^>]*>/gi, '\n')
        .replace(/<.*?>/gi, '')
        .trim();
};


/**
 * @param {Array.<Function>} funcs
 * @param {Function(!Error, Array.<Object>)} callback
 */
exports.parallel = (funcs, callback) => {
    let funcsDone = 0;
    let errGiven = false;
    let results = [];
    const len = funcs.length;

    const checkDone = (index, err, result) => {
        if (errGiven) { return; }
        if (err) {
            errGiven = true;
            callback(err);
            return;
        }
        results[index] = result;
        if (++funcsDone === len) {
            callback(null, results);
        }
    };

    if (len > 0) {
        funcs.forEach((f, i) => { f(checkDone.bind(null, i)); });
    } else {
        callback(null, results);
    }
};

/**
 * Changes url get request params
 *
 * @param {string} uri
 * @param {string} key
 * @param {string} value
 */
const changeURLParameter = (uri, key, value) => {
    var re = new RegExp('([?&])' + key + '=.*?(&|$)', 'i');
    var separator = uri.indexOf('?') !== -1 ? '&' : '?';
    if (uri.match(re)) {
        return uri.replace(re, '$1' + key + '=' + value + '$2');
    } else {
        return uri + separator + key + '=' + value;
    }
};

/**
 * Removes url get request params
 *
 * @param {string} uri
 * @param {string} key
 */
const removeURLParameter = (uri, key) => {
    var rtn = uri.split('?')[0],
        param,
        params_arr = [],
        queryString = uri.indexOf('?') !== -1 ? uri.split('?')[1] : '';
    if (queryString !== '') {
        params_arr = queryString.split('&');
        for (var i = params_arr.length - 1; i >= 0; i -= 1) {
            param = params_arr[i].split('=')[0];
            if (param === key) {
                params_arr.splice(i, 1);
            }
        }
        rtn = rtn + '?' + params_arr.join('&');
    }
    return rtn;
};


/** TAKEN FROM: https://github.com/fent/node-m3u8stream/blob/master/src/parse-time.ts
 *  TYPES HAVE BEEN STRIPPED
 * 
 * Converts human friendly time to milliseconds. Supports the format
 * 00:00:00.000 for hours, minutes, seconds, and milliseconds respectively.
 * And 0ms, 0s, 0m, 0h, and together 1m1s.
 * 
 * 
 * @param {string|number} time
 * @return {number}
 */
const humanStr = (time) => {
    const numberFormat = /^\d+$/;
    const timeFormat = /^(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2})(?:\.(\d{3}))?$/;
    const timeUnits = {
        ms: 1,
        s: 1000,
        m: 60000,
        h: 3600000,
    };

    if (typeof time === 'number') { return time; }
    if (numberFormat.test(time)) { return +time; }
    const firstFormat = timeFormat.exec(time);
    if (firstFormat) {
        return +(firstFormat[1] || 0) * timeUnits.h +
            +(firstFormat[2] || 0) * timeUnits.m +
            +firstFormat[3] * timeUnits.s +
            +(firstFormat[4] || 0);
    } else {
        let total = 0;
        const r = /(-?\d+)(ms|s|m|h)/g;
        let rs;
        while ((rs = r.exec(time)) != null) {
            total += +rs[1] * timeUnits[rs[2]];
        }
        return total;
    }
};


/**
 * Match begin and end braces of input JSON, return only json
 *
 * @param {String} mixedJson
 * @return {String}
*/
cutAfterJSON = (mixedJson) => {
    let open, close;
    if (mixedJson[0] === '[') {
        open = '[';
        close = ']';
    } else if (mixedJson[0] === '{') {
        open = '{';
        close = '}';
    }

    if (!open) {
        throw new Error(`Can't cut unsupported JSON (need to begin with [ or { ) but got: ${mixedJson[0]}`);
    }

    // States if the loop is currently in a string
    let isString = false;

    // Current open brackets to be closed
    let counter = 0;

    let i;
    for (i = 0; i < mixedJson.length; i++) {
        // Toggle the isString boolean when leaving/entering string
        if (mixedJson[i] === '"' && mixedJson[i - 1] !== '\\') {
            isString = !isString;
            continue;
        }
        if (isString) continue;

        if (mixedJson[i] === open) {
            counter++;
        } else if (mixedJson[i] === close) {
            counter--;
        }

        // All brackets have been closed, thus end of JSON is reached
        if (counter === 0) {
            // Return the cut JSON
            return mixedJson.substr(0, i + 1);
        }
    }

    // We ran through the whole string and ended up with an unclosed bracket
    throw Error("Can't cut unsupported JSON (no matching closing bracket found)");
};

const nonOriginalCustomExports = {
    changeURLParameter,
    removeURLParameter,
    humanStr,
    cutAfterJSON
}

export default { ...nonOriginalCustomExports, ...exports };
