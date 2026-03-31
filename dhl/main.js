const fs = require("fs");
const path = require("path");
const { extractSeed1 } = require("./intermediate/extract_seed1");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const PAGE_URL = "https://www.dhl.com/cn-zh/home/tracking.html";
const PAGE_PARAMS = new URLSearchParams({
  submit: "1",
  "tacking-id": "1232343",
  "tracking-id": "1232343",
});

const pageHeaders = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "zh-CN,zh;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  priority: "u=0, i",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": USER_AGENT,
};

function buildCookieString(cookieMap) {
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function updateCookieJar(cookieMap, response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  for (const entry of setCookies) {
    const firstPart = String(entry).split(";")[0];
    const eqIndex = firstPart.indexOf("=");
    if (eqIndex === -1) continue;
    cookieMap.set(firstPart.slice(0, eqIndex), firstPart.slice(eqIndex + 1));
  }
}

async function fetchText(url, headers, cookieMap) {
  const requestHeaders = { ...headers };
  const cookie = buildCookieString(cookieMap);
  if (cookie) {
    requestHeaders.cookie = cookie;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: requestHeaders,
    redirect: "follow",
  });

  updateCookieJar(cookieMap, response);

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

function extractLastScriptSrc(html) {
  const regex = /<script\b[^>]*>/gi;
  let match;
  let lastSrc = null;

  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    if (!/\btype=["']text\/javascript["']/i.test(tag)) continue;

    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    lastSrc = srcMatch[1];
  }

  if (!lastSrc) {
    throw new Error("Could not find the last <script type=\"text/javascript\"> src in HTML");
  }

  return lastSrc;
}

function printCookieSummary(cookieMap) {
  const keys = Array.from(cookieMap.keys());
  console.log(`Session cookies: ${keys.join(", ")}`);

  for (const name of ["_abck", "ak_bmsc", "bm_sz", "bm_sv"]) {
    const value = cookieMap.get(name);
    if (!value) {
      console.log(`${name}: <missing>`);
      continue;
    }
    console.log(`${name}: ${value.slice(0, 80)}${value.length > 80 ? "..." : ""}`);
  }
}

async function main() {
  const cookieMap = new Map();
  const referer = `${PAGE_URL}?${PAGE_PARAMS.toString()}`;

  // 第一次请求：打开 DHL 追踪页，建立初始 cookie。
  const html = await fetchText(referer, pageHeaders, cookieMap);
  const scriptSrc = extractLastScriptSrc(html);
  const scriptUrl = new URL(scriptSrc, PAGE_URL).toString();

  console.log(`script_src: ${scriptSrc}`);
  printCookieSummary(cookieMap);

  // 第二次请求：拉取当前 bundle，并提取 bundle 内嵌 seed[1]。
  const scriptHeaders = {
    accept: "*/*",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=2",
    referer,
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "script",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "same-origin",
    "user-agent": USER_AGENT,
  };

  const scriptText = await fetchText(scriptUrl, scriptHeaders, cookieMap);
  const scriptPath = path.join(__dirname, "test.js");
  fs.writeFileSync(scriptPath, scriptText, "utf8");
  console.log(`JS saved to ${scriptPath} (${scriptText.length} chars)`);

  const seedResult = extractSeed1(scriptText);
  if (seedResult.error) {
    throw new Error(`extractSeed1 failed: ${seedResult.error}`);
  }

  console.log(`bundle seed[1]: ${seedResult.seed1}`);
  if (seedResult.candidates.length !== 1) {
    console.log(`seed candidates: ${JSON.stringify(seedResult.candidates)}`);
  }

  printCookieSummary(cookieMap);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
