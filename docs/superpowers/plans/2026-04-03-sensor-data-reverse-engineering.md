# DHL Akamai sensor_data Reverse Engineering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse engineer the current live Akamai bundle's sensor_data generation logic via js-reverse MCP dynamic debugging, verify existing reconstruction, fill gaps, and produce a new standalone reconstruction file.

**Architecture:** Open DHL tracking page in browser via js-reverse MCP, capture the live Akamai bundle, set breakpoints at the sensor_data POST and payload construction sites, then systematically eval each field to verify/document its generation logic. Output goes to a new `screen_node_xag_live_v2.js`.

**Tech Stack:** js-reverse MCP (CDP debugging), Node.js, Akamai Bot Manager bundle analysis

---

## File Map

- **Create:** `dhl/intermediate/screen_node_xag_live_v2.js` — new standalone reconstruction
- **Create:** `dhl/intermediate/bundle_20260403.js` — saved copy of current live bundle
- **Reference (read-only):** `dhl/intermediate/screen_node_xag_live.js` — existing reconstruction for cross-reference
- **Reference (read-only):** `dhl/intermediate/AGENTS.md` — variable mapping conventions and methodology
- **Reference (read-only):** `dhl/test.js` — earlier bundle version for structural cross-reference

## Constraints

- **`ver` field:** Skip entirely (needs jsvmp execution).
- **Browser flagged:** `_abck` status will be -1. Observe logic only, never rely on POST results.
- **Stall rule:** If any single field stalls for ~10 minutes with no progress, stop and report findings to the user. Do not skip or move on.
- **Bundle variable rotation:** All variable names change per bundle version. Document the new mapping explicitly.

---

### Task 1: Open DHL Page & Capture Live Bundle

**Files:**
- Create: `dhl/intermediate/bundle_20260403.js`

- [ ] **Step 1: Open a new browser page to DHL tracking URL**

Use js-reverse MCP to open the DHL tracking page. The Akamai script loads automatically with the page.

```
Tool: mcp__js-reverse__new_page
  url: "https://www.dhl.com/cn-zh/home/tracking.html?tracking-id=1232343&submit=1"
  timeout: 30000
```

If DHL shows a challenge/countdown page, wait a few seconds and reload:
```
Tool: mcp__js-reverse__navigate_page
  type: "reload"
  timeout: 30000
```

- [ ] **Step 2: List scripts and locate the Akamai bundle**

```
Tool: mcp__js-reverse__list_scripts
  filter: "lUuI09H8"
```

Expected: One script with URL matching `/lUuI09H8kk2lCTn_ihnlZXLM/.../nwEPFIB`. Record the script URL (it may have changed from the previous bundle path).

- [ ] **Step 3: Save the bundle source to local file**

```
Tool: mcp__js-reverse__save_script_source
  url: <the Akamai script URL from Step 2>
  filePath: "/root/scrape/dhl/intermediate/bundle_20260403.js"
```

- [ ] **Step 4: Verify bundle was saved and note its size**

```bash
wc -c /root/scrape/dhl/intermediate/bundle_20260403.js
```

Expected: File exists, size ~800KB-1.2MB (typical Akamai bundle).

- [ ] **Step 5: Extract seeds[1] from the bundle using existing AST tool**

```bash
node /root/scrape/dhl/intermediate/extract_seed1.js /root/scrape/dhl/intermediate/bundle_20260403.js
```

Record the output seed value — this is the per-bundle constant for AhN permutation.

- [ ] **Step 6: Commit the captured bundle**

```bash
git add dhl/intermediate/bundle_20260403.js
git commit -m "Capture live Akamai bundle 2026-04-03

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Locate sensor_data POST Entry Point

**Files:**
- Reference: `dhl/intermediate/bundle_20260403.js`

- [ ] **Step 1: Set XHR breakpoint to catch the sensor_data POST**

The Akamai script POSTs `{"sensor_data":"..."}` to its own script URL. Set a breakpoint on XHR requests matching the Akamai URL pattern:

```
Tool: mcp__js-reverse__break_on_xhr
  url: "lUuI09H8"
```

- [ ] **Step 2: Trigger the sensor_data POST by reloading the page**

The Akamai script auto-fires a sensor POST shortly after page load. Reload to trigger it:

```
Tool: mcp__js-reverse__navigate_page
  type: "reload"
  timeout: 30000
```

Wait for the breakpoint to hit. If it doesn't hit within 10 seconds, the challenge page may be blocking — try reloading again.

- [ ] **Step 3: Inspect the call stack at the XHR breakpoint**

```
Tool: mcp__js-reverse__get_paused_info
  includeScopes: true
  maxScopeDepth: 2
```

Walk up the call stack to find:
1. The XHR `.send(body)` call — `body` contains `{"sensor_data":"..."}`
2. The function that constructed the body (equivalent of previous bundle's `mUF_build_request`)
3. The function that generated the sensor_data string (equivalent of `ZwF_gen_sensor`)
4. The payload assembly function (equivalent of `Uh5` which builds `hn5`)

Record the function names and their offsets in the bundle for each level.

- [ ] **Step 4: Read the payload assembly function source**

Using the offset found in step 3, read the payload construction code:

```
Tool: mcp__js-reverse__get_script_source
  url: <Akamai script URL>
  offset: <offset of payload assembly function>
  length: 3000
```

This should reveal the equivalent of `hn5 = QB(kO, [...])` — a key-value array being assembled into an object. Record:
- The new variable name for the payload object (was `hn5`)
- The new name for the array-to-object wrapper (was `QB`)
- The list of field assignments

- [ ] **Step 5: Document the new bundle's entry point mapping**

Write a comment block with the mapping, e.g.:
```
// Bundle 2026-04-03 mapping:
//   payload var: ??? (was hn5)
//   wrapper: ??? (was QB)
//   main gen function: ??? (was Uh5)
//   error fallback: ??? (was Zc5)
//   XHR send function: ??? (was vDF)
```

---

### Task 3: Per-Field Verification — Set Breakpoint at Payload Construction

**Files:**
- Reference: `dhl/intermediate/screen_node_xag_live.js` (§9 `build9013PayloadLive`)

- [ ] **Step 1: Remove the XHR breakpoint**

```
Tool: mcp__js-reverse__remove_breakpoint
  url: "lUuI09H8"
```

- [ ] **Step 2: Set a code breakpoint at the payload assembly site**

Set a breakpoint right after the payload object is fully populated (after the last field assignment), so all fields are available for inspection:

```
Tool: mcp__js-reverse__set_breakpoint_on_text
  text: <the pattern found in Task 2 Step 4, e.g. the JSON.stringify call on the payload>
  urlFilter: "lUuI09H8"
```

The ideal breakpoint position is just before `JSON.stringify(payload)` is called — at this point all fields are populated.

- [ ] **Step 3: Reload page to hit the breakpoint**

```
Tool: mcp__js-reverse__navigate_page
  type: "reload"
  timeout: 30000
```

- [ ] **Step 4: Verify breakpoint hit and inspect the payload object**

```
Tool: mcp__js-reverse__get_paused_info
  includeScopes: true
  maxScopeDepth: 3
```

Then eval the payload variable to see all fields:

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { try { return JSON.parse(JSON.stringify(<payloadVar>)); } catch(e) { return {error: e.message}; } }"
```

This gives us the complete payload with all runtime values. Save this output — it's the ground truth for verification.

- [ ] **Step 5: Dump payload field keys and types**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; var out = {}; for (var k in p) { var v = p[k]; out[k] = typeof v === 'object' ? (Array.isArray(v) ? 'array['+v.length+']' : 'object{'+Object.keys(v).join(',')+'}') : typeof v + ':' + String(v).slice(0,80); } return out; }"
```

Compare the field list against `build9013PayloadLive` in `screen_node_xag_live.js` §9. Note any new fields or missing fields.

---

### Task 4: Verify & Document Each Payload Field

This is the core task. For each field in the payload, eval its value at the breakpoint, trace its generation logic, and document findings. Follow the natural order of fields as they appear in the payload.

**Files:**
- Create: `dhl/intermediate/screen_node_xag_live_v2.js`
- Reference: `dhl/intermediate/screen_node_xag_live.js`

The approach for each field is:
1. Eval the field value at the breakpoint
2. Compare with `screen_node_xag_live.js` expected value/logic
3. If matches → mark verified, copy logic with new bundle mapping
4. If differs → trace the assignment chain to understand the new logic
5. If complex/opaque → search for the variable assignment in the bundle source, set secondary breakpoints if needed

- [ ] **Step 4.1: Create the v2 file with header and utility section**

Create `dhl/intermediate/screen_node_xag_live_v2.js` with the file header and §1 Utilities (xq, sha256Hex — these are stable across bundles):

```javascript
// sensor_data reconstruction — verified against live bundle 2026-04-03
//
// Bundle source: dhl/intermediate/bundle_20260403.js
// Previous version: dhl/intermediate/screen_node_xag_live.js
//
// Bundle variable mapping (2026-04-03):
//   payload var: TBD
//   wrapper fn: TBD
//   main gen fn: TBD
//   seeds[1]: TBD
//
// Field verification status:
//   [V] = verified against live bundle
//   [C] = changed from previous bundle, updated
//   [N] = newly reverse-engineered
//   [S] = skipped (ver — needs jsvmp)
//   [T] = TBD, needs further investigation

// ═══════════════════════════════════════════════════════════════════════
// §1  Utilities
// ═══════════════════════════════════════════════════════════════════════

function xq(str) {
    if (str == null) return -1;
    var sum = 0;
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) sum += code;
    }
    return sum;
}

function sha256Hex(input) {
    try {
        return require("crypto").createHash("sha256").update(String(input)).digest("hex");
    } catch (e) {
        throw new Error("sha256Hex requires Node.js crypto");
    }
}
```

- [ ] **Step 4.2: Eval and verify simple scalar fields**

At the payload breakpoint, eval each simple field and compare with screen_node_xag_live.js expectations:

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { ver: p.ver, eem: p.eem, ajt: p.ajt, o9: p.o9, ffl: p.ffl, sde: p.sde, per: p.per, sws: p.sws, mis: p.mis, og: p.og, te: p.te, nte: p.nte, mte: p.mte, pnte: p.pnte, pte: p.pte, pmte: p.pmte, tab: p.tab, pus: p.pus }; }"
```

For each field:
- `ver`: Record value, mark [S] skipped
- `eem`: Expect "do_en,dm_en,t_en" — verify and mark [V] if matches
- `ajt`: Expect "0,0" on no-interaction path — verify
- `o9`: Expect 0 — verify
- `ffl`: Expect second URL path segment — verify
- `sde`: Expect "0,0,0,0,1,0,0" — verify
- `per`: Expect 20-digit string — verify
- `sws`: Expect 0 — verify
- `og`: Expect "sm" — verify
- And so on for the remaining scalar fields

Document each result as a comment in the v2 file.

- [ ] **Step 4.3: Eval and verify `fpt` / `fpc` (fingerprint string)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { fpt: p.fpt, fpc: p.fpc, fpt_type: typeof p.fpt, fpt_len: p.fpt ? p.fpt.length : null }; }"
```

Verify that `fpc` equals `xq(fpt)`. Write the fingerprint builder into v2 file.

- [ ] **Step 4.4: Eval and verify `din` (browser fingerprint array)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { din: p.din, din_len: Array.isArray(p.din) ? p.din.length : 'not_array' }; }"
```

Expected: Array of 23 single-key objects (ua, xag, nps, nal, nap, npl, pha, wdr, dau, hz1, tsd, asw, ash, swi, she, wiw, wih, wow, adp, ucs, ran, hal, ibr). Verify field order matches `getBrowserFingerprint()` in screen_node_xag_live.js §5. Note: `xag` value may differ due to browser detection flags.

- [ ] **Step 4.5: Eval and verify `ajr` (user-agent + timestamp hash)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { ajr: p.ajr, ajr_len: p.ajr ? p.ajr.length : null }; }"
```

Expected: 128-char hex string (two sha256 hashes concatenated). Verify structure matches `buildAjrLive`.

- [ ] **Step 4.6: Eval and verify `mst` (main state telemetry)**

This is the largest sub-structure (~30 fields). Eval the full mst array:

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; if (!Array.isArray(p.mst)) return {type: typeof p.mst, val: p.mst}; return p.mst.map(function(item) { var k = Object.keys(item)[0]; return k + '=' + JSON.stringify(item[k]); }); }"
```

Cross-check each mst sub-field against `buildMstLive` in screen_node_xag_live.js §7:
- `kevl`, `mevl`, `tevl`: OR masks (|1, |32, |32)
- `sts`: startTimestamp
- `fct`: fingerprint timing delta
- `dd2`: `parseInt(parseInt(startTs/(2016*2016),10)/23,10)`
- `nfas`: bundle constant (was 30261689 — may have changed)
- `jsrf`: fixed string (was "PiZtE" — may have changed)
- `jsrf1`/`jsrf2`: verify genJsrfLive algorithm
- `dvc`: the critical 3-part string (hash, delta, plugins)

Pay special attention to `dvc` — this is a known gap. If it contains values, trace its components.

- [ ] **Step 4.7: Deep-dive `dvc.hash` (SY function) — known gap**

If the `dvc` field in mst has a non-empty hash component, we need to trace SY():

1. Search for the hash computation in the bundle:
```
Tool: mcp__js-reverse__search_in_sources
  query: <the dvc hash value observed in step 4.6>
  excludeMinified: false
  urlFilter: "lUuI09H8"
```

2. If that doesn't work, search for the function pattern. The SY function takes 4 args (delt, ajr, fct, tovl) and returns a hash:
```
Tool: mcp__js-reverse__search_in_sources
  query: "createHash"
  excludeMinified: false
  urlFilter: "lUuI09H8"
```

Or search for the known plugin enumeration pattern:
```
Tool: mcp__js-reverse__search_in_sources
  query: "j+k+d+l+i+e+g+h+c+a+"
  excludeMinified: false
```

3. Set a breakpoint at the SY function and eval its inputs/output
4. Document the algorithm in v2 file

**STALL RULE**: If tracing SY() makes no progress for ~10 minutes, stop and report findings to user.

- [ ] **Step 4.8: Eval and verify `dsi` (DOM/script integrity)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return p.dsi; }"
```

Focus on `ico` field (known gap — sha256 of unknown input):
- If ico is a 64-char hex string, search the bundle for calls that produce it
- Trace the input to the sha256 that generates ico

**STALL RULE**: If tracing ico input makes no progress for ~10 minutes, stop and report findings to user.

- [ ] **Step 4.9: Eval and verify `wsl` (performance/page metrics)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { wsl: p.wsl, wsl_type: typeof p.wsl }; }"
```

Compare the 20-field CSV against `buildWslLive`. Note actual heap sizes and meta count from the live page.

- [ ] **Step 4.10: Eval and verify `sww` (Client Hints double-sample)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return p.sww; }"
```

Verify the double-sampling structure matches `buildSwwLive` §8.

- [ ] **Step 4.11: Eval and verify `hls` (async probe — known gap)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { hls: p.hls, hls_type: typeof p.hls }; }"
```

If hls is undefined/null on the no-interaction path, document that. If it has a value, trace its source.

- [ ] **Step 4.12: Eval remaining fields (ffs, inf, kev, dme, mev, doe, pur, pev, vev, tev, pde, oev, if, tcd)**

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { var p = <payloadVar>; return { ffs: p.ffs, inf: p.inf, kev: p.kev, dme: p.dme, mev: p.mev, doe: p.doe, pur: p.pur, pev: p.pev, vev: p.vev, tev: p.tev, pde: p.pde, oev: p.oev, 'if': p['if'], tcd: p.tcd }; }"
```

Most of these are empty strings or 0 on the no-interaction path. Verify each and document.

- [ ] **Step 4.13: Write all verified field builders into v2 file**

For each verified field, write (or copy-with-updates from v1) the corresponding builder function into `screen_node_xag_live_v2.js`. Include:
- The runtime-observed value as a comment
- The new bundle variable name mapping
- Verification date stamp `// [V] verified 2026-04-03` or `// [C] changed 2026-04-03`

---

### Task 5: Verify Encryption Pipeline

**Files:**
- Modify: `dhl/intermediate/screen_node_xag_live_v2.js`

- [ ] **Step 1: Verify seeds extraction**

At the breakpoint (or via evaluate_script), extract the seeds array:

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { return document.cookie; }"
  mainWorld: true
```

Parse `bm_sz` cookie to get seeds[0]. Compare seeds[1] with the value from Task 1 Step 5.

- [ ] **Step 2: Verify czG encryption constants**

Search for the LCG constants in the bundle to confirm they haven't changed:

```
Tool: mcp__js-reverse__search_in_sources
  query: "65793"
  excludeMinified: false
  urlFilter: "lUuI09H8"
```

Expected: multiply=65793, add=4282663, AND=8388607. If same, czG_live is confirmed.

- [ ] **Step 3: Verify ahnPermute separator and algorithm**

Search for the Fisher-Yates shuffle pattern:

```
Tool: mcp__js-reverse__search_in_sources
  query: "4282663"
  excludeMinified: false
  urlFilter: "lUuI09H8"
```

Confirm same constants used in both czG and AhN functions.

- [ ] **Step 4: Verify header format**

Search for the header construction:

```
Tool: mcp__js-reverse__search_in_sources
  query: "\"3;\""
  excludeMinified: false
  urlFilter: "lUuI09H8"
```

Or eval at the sensor_data construction point to see the header prefix. Confirm format: `"3;0;1;0;{seed0};{sha256Base64}"`.

Extract the `sha256Base64` per-bundle constant.

- [ ] **Step 5: Verify timing segment format**

Eval the timing segment at the sensor POST point:

```
Tool: mcp__js-reverse__evaluate_script
  function: "() => { /* eval the timing construction variable */ }"
```

Confirm 6-field CSV format matches `buildTimingSegmentLive`.

- [ ] **Step 6: Write encryption pipeline into v2 file**

Copy czG_live, ahnPermute/ahnUnpermute, buildHeaderLive, buildTimingSegmentLive, encode9013PayloadLive, concatSensorDataSegmentsLive into v2 file with updated constants (sha256Base64, seeds[1]).

---

### Task 6: Assemble Final v2 Reconstruction File

**Files:**
- Modify: `dhl/intermediate/screen_node_xag_live_v2.js`

- [ ] **Step 1: Update the file header with all discovered mappings**

Fill in the TBD fields in the header:
```javascript
// Bundle variable mapping (2026-04-03):
//   payload var: <actual>
//   wrapper fn: <actual>
//   main gen fn: <actual>
//   seeds[1]: <actual value>
//   sha256Base64: <actual value>
```

- [ ] **Step 2: Add the complete build9013PayloadLive function**

Using all verified fields from Task 4, write the payload assembly function. For any field still TBD, include a clear comment:
```javascript
// [T] TBD: dvc.hash requires tracing SY() — 4-param hash algorithm
//     Inputs: (delt, ajr, fct, tovl). Stalled at: <what was found>
//     Next step: <what needs to happen>
```

- [ ] **Step 3: Add module.exports**

Export all functions following the same §1-§11 structure as v1.

- [ ] **Step 4: Verify the file is syntactically valid**

```bash
node -c /root/scrape/dhl/intermediate/screen_node_xag_live_v2.js
```

Expected: No syntax errors.

- [ ] **Step 5: Commit the v2 reconstruction file**

```bash
git add dhl/intermediate/screen_node_xag_live_v2.js
git commit -m "Add v2 sensor_data reconstruction from 2026-04-03 live bundle

Verified against live Akamai bundle via js-reverse MCP debugging.
See file header for field verification status and bundle variable mapping.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Summary Report

- [ ] **Step 1: Produce a summary of findings**

Write a brief summary covering:
1. **Verified fields** — list of fields confirmed matching v1 logic
2. **Changed fields** — any fields whose logic changed from the previous bundle
3. **Newly reversed fields** — gaps that were filled in
4. **Remaining TBDs** — fields that still need work, with specific next steps for each
5. **New bundle constants** — seeds[1], sha256Base64, nfas, jsrf, and any others
6. **Variable mapping table** — new bundle names <-> field names

Present this to the user for review and next-step decisions.
