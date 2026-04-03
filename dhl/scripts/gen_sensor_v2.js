// Pure reconstruction sensor_data generator — no bundle execution needed
// Input (stdin JSON): { cookie, script_path, page_url, post_url, seed1, sha256base64 }
// Output (stdout JSON): { sensor_data: "..." }

const v2 = require("../intermediate/screen_node_xag_live_v2");

let inputBuf = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (inputBuf += chunk));
process.stdin.on("end", () => {
    try {
        const config = JSON.parse(inputBuf);
        const result = run(config);
        process.stdout.write(JSON.stringify(result));
    } catch (e) {
        process.stderr.write(`Error: ${e.message}\n`);
        process.stdout.write(JSON.stringify({ error: e.message }));
    }
});

function run(config) {
    const {
        cookie,
        page_url,
        post_url,
        seed1,
        sha256base64,
    } = config;

    const userAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    const startTs = Date.now();

    // Per-bundle constants — update when bundle changes
    const bundleSeed1 = seed1 || 3262385;
    const sha256Base64 = sha256base64 || "m60VnGafP60H/Mi0YDtpkmi/l1dVcaedlch/8hSWe7k=";

    const sensorData = v2.buildSensorData({
        cookieStr: cookie,
        bundleSeed1: bundleSeed1,
        sha256Base64: sha256Base64,
        userAgent: userAgent,
        pageUrl: page_url,
        scriptUrl: post_url,
        startTs: startTs,
        // Windows Chrome desktop defaults
        language: "zh-CN",
        screenWidth: 1920,
        screenHeight: 1080,
        availWidth: 1920,
        availHeight: 1040,
        innerWidth: 1920,
        innerHeight: 929,
        outerWidth: 1920,
        outerHeight: 1040,
        pluginsLength: 5,
        xag: 12243,  // Windows Chrome (no Touch/DeviceOrientation + PointerEvent)
        adp: "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:0,isc:0,vib:0,bat:1,x11:0,x12:1",
    });

    return { sensor_data: sensorData };
}
