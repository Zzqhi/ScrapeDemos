# DHL Akamai sensor_data Reverse Engineering — Design Spec

**Date:** 2026-04-03
**Scope:** Dynamic debugging of live Akamai bundle via js-reverse MCP to verify existing sensor_data reconstruction and fill in missing fields.

---

## Goal

Produce a complete, verified Node.js reconstruction of the Akamai `sensor_data` generation logic for DHL's tracking page. The output should enable `main.py`'s flow to achieve `_abck` status = 0.

## Approach: Verify + Fill Gaps (Option C)

1. Use js-reverse MCP to open DHL's tracking page in a browser
2. Locate and save the current live Akamai bundle
3. Trace the sensor_data generation call chain from XHR POST back to payload construction
4. Compare each field's generation logic against `screen_node_xag_live.js` (existing ~60% reconstruction)
5. Fill in missing/TBD fields by tracing their assignment chains in the live bundle
6. Output a new reconstruction file that stands on its own

## Phases

### Phase 1 — Environment & Bundle Acquisition

- `js-reverse:new_page` + `navigate_page` to DHL tracking URL
- Wait for Akamai script load (filter: `lUuI09H8`)
- `save_script_source` to capture the current bundle locally
- Note: browser environment is flagged (`_abck` status = -1), but we only need to observe generation logic, not POST results

### Phase 2 — Structure Mapping

- Search bundle for XHR `.send()` with `sensor_data` in body → identify POST function
- Walk call stack backward to find payload assembly function (equivalent of `Uh5`/`hn5` in previous bundles)
- Map new bundle's variable names to payload field names
- Cross-reference with `screen_node_xag_live.js` §9 `build9013PayloadLive` field list

### Phase 3 — Per-Field Verification & Gap Filling

Set breakpoint at payload construction, eval each field. Progress order: follow natural code flow, not a fixed priority list.

**Already reconstructed (verify correctness on new bundle):**
- `fpt` / `fpc` — fingerprint string and its checksum
- `din` — browser fingerprint array (23 fields, §5)
- `ajr` — sha256(ua) + sha256(startTimestamp)
- `ajt` — interaction state "0,0"
- `ffl` — script URL path segment
- `eem` — event enable mask
- `ffs` / `inf` — form fingerprint
- `mst` — main state telemetry (30+ sub-fields)
- `per` — Permissions API 20-digit probe
- `dsi` — DOM/script integrity (12 fields, `ico` is TBD)
- `wsl` — performance.memory + page metrics
- `sww` — Client Hints double-sample
- Encryption pipeline: `czG_live` + `ahnPermute` + header + timing segment

**Known gaps (fill in):**
- `ver` — **skip for now**, likely needs jsvmp execution
- `dvc.hash` (SY function) — 4-parameter hash, core check
- `dsi.ico` — sha256 input source unknown
- `hls` — async probe, current value unclear
- `sde` — 7-field CSV, hardcoded "0,0,0,0,1,0,0"
- `wsl` precise values — heap sizes, meta count, WebGL params
- `nfas` — dispatcher constant, may change per bundle
- `jsrf` / `jsrf1` / `jsrf2` — algorithm reconstructed, needs live verification
- `sha256Base64` (header) — per-bundle constant
- `seeds[1]` — per-bundle constant (extractable via AST)

### Phase 4 — Output

**New file:** `dhl/intermediate/screen_node_xag_live_v2.js`

Structure mirrors `screen_node_xag_live.js` (§1-§11) but:
- Each function includes the new bundle's variable mapping as comments
- Verified fields marked with bundle date
- Unresolved fields marked `// TBD` with what's needed to resolve

## Constraints

- **No skipping on stall** — if a single field stalls for ~10 minutes, pause and report findings to user for decision. Do not skip or move on autonomously.
- **`ver` deferred** — known to require jsvmp execution, skip entirely this session.
- **Browser is flagged** — `_abck` will be -1. We observe logic only, not POST outcomes.
- **Reference, don't copy** — use `screen_node_xag_live.js` as structural guide but verify everything from the live bundle.
- **Bundle variables rotate** — all variable names change per bundle version. Document the new mapping.

## Success Criteria

- New reconstruction file covers all payload fields from Phase 3
- Each field's generation logic is either verified against the live bundle or clearly marked TBD with reason
- Encryption pipeline (czG + AhN + header + timing) confirmed working on new bundle
- Variable mapping table (new bundle names <-> field names) documented
