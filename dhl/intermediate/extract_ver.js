/**
 * Extract the current live Akamai `ver` field through Chrome DevTools Protocol.
 *
 * Why CDP instead of pure static parsing:
 *   - `ver` is bundle-initialized and changes when the live bundle rotates.
 *   - The same script URL path can serve different bundle contents over time.
 *   - Static variable names (`vF9`, `ON`, `LM`, ...) are not stable across rotations.
 *
 * This script opens a fresh target in an existing Chrome instance with
 * `--remote-debugging-port`, injects a `JSON.stringify` hook before page scripts
 * run, then waits for the sensor payload object and prints the captured `ver`.
 *
 * Usage:
 *   node extract_ver.js
 *   node extract_ver.js "https://www.dhl.com/cn-zh/home/tracking.html?tracking-id=1232343&submit=1"
 *   node extract_ver.js --port 9222 --timeout 20000
 */

const DEFAULT_PAGE_URL =
    "https://www.dhl.com/cn-zh/home/tracking.html?tracking-id=1232343&submit=1";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9222;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_POLL_MS = 250;

function parseArgs(argv) {
    const out = {
        pageUrl: DEFAULT_PAGE_URL,
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        pollMs: DEFAULT_POLL_MS,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === "--host" && argv[i + 1]) {
            out.host = argv[++i];
        } else if (arg === "--port" && argv[i + 1]) {
            out.port = Number(argv[++i]);
        } else if (arg === "--timeout" && argv[i + 1]) {
            out.timeoutMs = Number(argv[++i]);
        } else if (arg === "--poll" && argv[i + 1]) {
            out.pollMs = Number(argv[++i]);
        } else if (!arg.startsWith("--")) {
            out.pageUrl = arg;
        }
    }

    if (!Number.isFinite(out.port) || out.port <= 0) {
        throw new Error("Invalid --port");
    }
    if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) {
        throw new Error("Invalid --timeout");
    }
    if (!Number.isFinite(out.pollMs) || out.pollMs <= 0) {
        throw new Error("Invalid --poll");
    }

    return out;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.eventWaiters = new Map();
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.addEventListener("message", (event) => this._onMessage(event));
        this.ws.addEventListener("error", (event) => {
            const err = event.error || new Error("CDP websocket error");
            for (const pending of this.pending.values()) pending.reject(err);
            this.pending.clear();
        });

        await new Promise((resolve, reject) => {
            const onOpen = () => {
                cleanup();
                resolve();
            };
            const onError = (event) => {
                cleanup();
                reject(event.error || new Error("CDP websocket open failed"));
            };
            const cleanup = () => {
                this.ws.removeEventListener("open", onOpen);
                this.ws.removeEventListener("error", onError);
            };
            this.ws.addEventListener("open", onOpen);
            this.ws.addEventListener("error", onError);
        });
    }

    close() {
        if (!this.ws) return;
        try {
            this.ws.close();
        } catch (e) {
            // ignore
        }
    }

    _onMessage(event) {
        const message = JSON.parse(event.data);

        if (message.id) {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
            return;
        }

        const waiters = this.eventWaiters.get(message.method);
        if (!waiters || waiters.length === 0) return;
        const waiter = waiters.shift();
        waiter(message.params || {});
    }

    send(method, params = {}, sessionId) {
        const id = this.nextId++;
        const payload = { id, method, params };
        if (sessionId) payload.sessionId = sessionId;

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(payload));
        });
    }

    waitForEvent(method, timeoutMs) {
        return new Promise((resolve, reject) => {
            const list = this.eventWaiters.get(method) || [];
            this.eventWaiters.set(method, list);

            const timer = setTimeout(() => {
                const idx = list.indexOf(done);
                if (idx >= 0) list.splice(idx, 1);
                reject(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);

            const done = (params) => {
                clearTimeout(timer);
                resolve(params);
            };

            list.push(done);
        });
    }
}

function buildHookScript() {
    return `
(() => {
  const nativeStringify = JSON.stringify;
  if (nativeStringify && nativeStringify.__akamaiVerHookInstalled) return;
  function capture(value) {
    try {
      if (!value || typeof value !== "object") return;
      if (!Object.prototype.hasOwnProperty.call(value, "ver")) return;
      if (!Object.prototype.hasOwnProperty.call(value, "ajt")) return;
      const scripts = Array.from(document.scripts || [])
        .map((s) => s && s.src)
        .filter(Boolean);
      const akamaiScriptUrl = scripts.find((src) => /\\/lUuI09H8.*\\/nwEPFIB/.test(src)) || "";
      globalThis.__akamai_ver_capture = {
        ver: value.ver,
        ajt: value.ajt,
        ffl: value.ffl || "",
        pur: value.pur || "",
        akamaiScriptUrl,
        keys: Object.keys(value).slice(0, 20),
        capturedAt: Date.now(),
      };
    } catch (e) {}
  }
  function wrapped(value, ...rest) {
    capture(value);
    return nativeStringify.call(this, value, ...rest);
  }
  wrapped.__akamaiVerHookInstalled = true;
  JSON.stringify = wrapped;
})();
`;
}

async function evaluateJson(client, sessionId, expression) {
    const result = await client.send(
        "Runtime.evaluate",
        {
            expression,
            returnByValue: true,
            awaitPromise: true,
        },
        sessionId
    );

    if (result.exceptionDetails) {
        throw new Error("Runtime.evaluate failed");
    }

    return result.result ? result.result.value : undefined;
}

async function extractVer(options) {
    const { host, port, pageUrl, timeoutMs, pollMs } = options;
    const versionUrl = `http://${host}:${port}/json/version`;
    const version = await fetch(versionUrl).then((r) => r.json());
    const client = new CdpClient(version.webSocketDebuggerUrl);
    await client.connect();

    let targetId = null;
    let sessionId = null;

    try {
        const created = await client.send("Target.createTarget", {
            url: "about:blank",
        });
        targetId = created.targetId;

        const attached = await client.send("Target.attachToTarget", {
            targetId,
            flatten: true,
        });
        sessionId = attached.sessionId;

        await client.send("Page.enable", {}, sessionId);
        await client.send("Runtime.enable", {}, sessionId);
        await client.send(
            "Page.addScriptToEvaluateOnNewDocument",
            { source: buildHookScript() },
            sessionId
        );
        await client.send("Page.navigate", { url: pageUrl }, sessionId);

        const deadline = Date.now() + timeoutMs;
        let lastReadyState = null;

        while (Date.now() < deadline) {
            const capture = await evaluateJson(
                client,
                sessionId,
                "globalThis.__akamai_ver_capture || null"
            );
            if (capture && capture.ver) {
                return capture;
            }

            lastReadyState = await evaluateJson(
                client,
                sessionId,
                "document.readyState"
            ).catch(() => lastReadyState);

            await sleep(pollMs);
        }

        throw new Error(
            `Timed out waiting for ver capture (last document.readyState=${lastReadyState})`
        );
    } finally {
        if (targetId) {
            try {
                await client.send("Target.closeTarget", { targetId });
            } catch (e) {
                // ignore
            }
        }
        client.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const capture = await extractVer(options);
    console.log(JSON.stringify(capture, null, 2));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err && err.stack ? err.stack : String(err));
        process.exit(1);
    });
}

module.exports = {
    extractVer,
    parseArgs,
};
