const querystring = require("query-string");
const url = require("url");
const Entities = require("html-entities").AllHtmlEntities;

import util from "./util";

const VIDEO_URL = "https://www.youtube.com/watch?v=";
const getMetaItem = (body, name) => {
    return util.between(body, `<meta itemprop="${name}" content="`, '">');
};

/**
 * Get video description from html
 *
 * @param {string} html
 * @return {string}
 */
const getVideoDescription = html => {
    const regex = /<p.*?id="eow-description".*?>(.+?)<\/p>[\n\r\s]*?<\/div>/im;
    const description = html.match(regex);
    return description ? Entities.decode(util.stripHTML(description[1])) : "";
};

const getFullDescription = html => {
    const description = util.between(html, '<p id="eow-description" class="" >', "</p>");
    const regex = /(<a\/?[^>]+(>|$))/ig;
    const result = description.replace(regex, '<a>');

    return result ? result : "";
};

/**
 * Get video views count from html
 *
 * @param {string} html
 * @return {string}
 */
const getViewsCount = body => {
    const viewsCount = util.between(body, '<div class="watch-view-count">', "</div>");
    return viewsCount ? parseInt(viewsCount.replace(/[^0-9\.]/g, ''), 10) : 0;
};

/**
 * Get video media (extra information) from html
 *
 * @param {string} body
 * @return {Object}
 */
const getVideoMedia = body => {
    let mediainfo = util.between(
        body,
        '<div id="watch-description-extras">',
        '<div id="watch-discussion" class="branded-page-box yt-card">'
    );
    if (mediainfo === "") {
        return {};
    }

    const regexp = /<h4 class="title">([\s\S]*?)<\/h4>[\s\S]*?<ul .*?class=".*?watch-info-tag-list">[\s\S]*?<li>([\s\S]*?)<\/li>(?:\s*?<li>([\s\S]*?)<\/li>)?/g;
    const contentRegexp = /(?: - (\d{4}) \()?<a .*?(?:href="([^"]+)")?.*?>(.*?)<\/a>/;
    const imgRegexp = /<img src="([^"]+)".*?>/;
    const media = {};

    const image = imgRegexp.exec(mediainfo);
    if (image) {
        media.image = url.resolve(VIDEO_URL, image[1]);
    }

    let match;
    while ((match = regexp.exec(mediainfo)) != null) {
        let [, key, value, detail] = match;
        key = Entities.decode(key)
            .trim()
            .replace(/\s/g, "_")
            .toLowerCase();
        const content = contentRegexp.exec(value);
        if (content) {
            let [, year, mediaUrl, value2] = content;
            if (year) {
                media.year = parseInt(year);
            } else if (detail) {
                media.year = parseInt(detail);
            }
            value = value.slice(0, content.index);
            if (key !== "game" || value2 !== "YouTube Gaming") {
                value += value2;
            }
            media[key + "_url"] = "";
        }
        media[key] = Entities.decode(value);
    }
    return media;
};

/**
 * Get video Owner from html.
 *
 * @param {string} body
 * @return {Object}
 */
const userRegexp = /<a href="\/user\/([^"]+)/;
const verifiedRegexp = /<span .*?(aria-label="Verified")(.*?(?=<\/span>))/;
const getAuthor = body => {
    let ownerinfo = util.between(
        body,
        '<div id="watch7-user-header" class=" spf-link ">',
        '<div id="watch8-action-buttons" class="watch-action-buttons clearfix">'
    );
    if (ownerinfo === "") {
        return {};
    }
    const channelName = Entities.decode(
        util.between(
            util.between(ownerinfo, '<div class="yt-user-info">', "</div>"),
            ">",
            "</a>"
        )
    );
    const userMatch = ownerinfo.match(userRegexp);
    const verifiedMatch = ownerinfo.match(verifiedRegexp);
    const channelID = getMetaItem(body, "channelId");
    const username = userMatch
        ? userMatch[1]
        : util.between(
            util.between(body, '<span itemprop="author"', "</span>"),
            "/user/",
            '">'
        );
    return {
        id: channelID,
        name: channelName,
        avatar: url.resolve(
            VIDEO_URL,
            util.between(ownerinfo, 'data-thumb="', '"')
        ),
        verified: !!verifiedMatch,
        user: username,
        channel_url: "https://www.youtube.com/channel/" + channelID,
        user_url: "https://www.youtube.com/user/" + username
    };
};

/**
 * Get video published at from html.
 *
 * @param {string} body
 * @return {string}
 */
const getPublished = body => {
    return Date.parse(getMetaItem(body, "datePublished"));
};

/**
 * Get video published at from html.
 * Credits to https://github.com/paixaop.
 *
 * @param {string} body
 * @return {Array.<Object>}
 */
const getRelatedVideos = body => {
    let jsonStr = util.between(body, "'RELATED_PLAYER_ARGS': {\"rvs\":", "},");
    try {
        jsonStr = JSON.parse(jsonStr);
    } catch (err) {
        return [];
    }
    return jsonStr.split(",").map(link => querystring.parse(link));
};

let extras = {
    getMetaItem,
    getMetaItem,
    getVideoDescription,
    getFullDescription,
    getVideoMedia,
    getAuthor,
    getPublished,
    getRelatedVideos,
    getViewsCount
};
export default extras;
