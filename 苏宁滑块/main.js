const axios = require("axios")
const qs = require("qs")
const fs = require("fs");
const beautify = require("js-beautify").js;

console.log("Chrome".indexOf('C'))

const headers = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://passport.suning.com",
    "Referer": "https://passport.suning.com/ids/login",
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

function parseJSONP(str) {
    let start = str.indexOf("(");
    let end = str.lastIndexOf(")");
    return {
        name: str.substring(0, start),
        value: JSON.parse(str.slice(start + 1, end)),
    };
}

function unwrapJS(code) {
    if (typeof code !== "string") return code;

    const trimmed = code.trim();

    // 只处理：'...'
    if (
        (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        return trimmed.slice(1, -1);
    }

    return code;
}

function beautifyJS(code) {
    return beautify(code, {
        indent_size: 2,
        max_preserve_newlines: 2,
    });
}

// 获取ticket
async function fetchTicket(username) {
    const url = "https://passport.suning.com/ids/iarVerifyCodeTicket"

    const data = qs.stringify({
        username: username,
    })

    const res = await axios.post(url, data, { headers })
    return res.data
}

// 获取cfg配置
async function fetchInit(ticket) {
    const url = "https://iar-web.suning.com/iar-web/init.json"

    const params = {
        _callback: "c" + Math.floor(1e10 * Math.random()),
        ticket: ticket,
        client: "",
        jsCode: "",
        tInfo: "",
    }

    const res = await axios.get(url, {
        headers,
        params,
    });

    return res.data
}

// 获取fp.js
async function fetchFP() {
    const url = "https://dfp.suning.com/dfprs-collect/dist/fp.js"

    const params = {
        appCode: "qEmt9X4YmoV2Vye8"
    }

    const res = await axios.get(url, {
        headers,
        params,
    });

    return res.data
}

// 获取mrg.js
async function fetchMGR(server, path) {
    const url = `https://${server}${path}`

    const res = await axios.get(url, {
        headers,
    });

    return res.data
}

// 主流程
async function main() {
    let ticketRes = await fetchTicket('13223930100')
    let cfg = await fetchInit(ticketRes.ticket)
    config = parseJSONP(cfg)
    console.log(JSON.stringify(config))
    let fpJS = await fetchFP()
    let mgrJS = await fetchMGR(config.value.static_server, config.value.js)
    const cleanFpJS = unwrapJS(fpJS);
    const cleanMgrJS = unwrapJS(mgrJS);

    const outDir = __dirname;
    fs.writeFileSync(`${outDir}/fp.js`, beautifyJS(cleanFpJS));
    fs.writeFileSync(`${outDir}/mgr.js`, beautifyJS(cleanMgrJS));
}

main().catch(console.error);