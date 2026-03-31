/**
 * AST-based seeds[1] extractor for Akamai bundles.
 *
 * Strategy:
 *   1. Parse the bundle source with Babel.
 *   2. Find all ArrayExpression nodes with 20–70 StringLiteral elements
 *      (candidates for the cipher-setup / AI-keys arrays).
 *   3. Auto-detect the digit substitution cipher by matching known constants:
 *        65793 (5 unique chars) → 5 mappings
 *        4282663 (7 chars)      → +2-3 mappings
 *        8388607 (7 chars)      → remaining
 *   4. Detect the separator character (not a digit, used before trailing padding).
 *   5. Decode all encoded strings and find seeds[1]:
 *        – value between 1 000 000 and 9 999 999
 *        – not 8 888 888 (defaultSeed1)
 *        – not a known standard constant
 *
 * Usage:
 *   node extract_seed1.js <bundle.js>
 *   const { extractSeed1 } = require('./extract_seed1');
 *   extractSeed1(bundleSource);
 */

const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

// ── Known constants to exclude ──────────────────────────────────────────────

const KNOWN_CONSTANTS = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 24, 25, 26, 28, 29, 32, 34, 36, 67, 75, 92, 99, 100, 111, 127,
    200, 201, 290, 333, 749, 982, 999, 1000, 1001, 1024, 2000, 2016, 2048,
    2222, 2999, 3000, 3600, 4095, 4096, 4999, 5000, 5381, 8192, 10000,
    16384, 32768, 65535, 65536, 65793, 999999,
    3600000, 21600000,
    4282663, 8388607, 8888888,
    4294967295, 4294967296,
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permutations(rest)) result.push([arr[i], ...p]);
    }
    return result;
}

// ── Cipher auto-detection ───────────────────────────────────────────────────

/**
 * Given a pool of encoded strings, derive the 10-char → digit mapping
 * and the separator character.
 */
function detectCipher(strings) {
    // Collect unique characters, but only from strings that share characters
    // with the candidate cipher strings (to avoid pollution from dispatch tables).
    // We'll compute allChars lazily after we find the first partial cipher.
    const _allStringChars = new Set();
    for (const s of strings) for (const c of s) _allStringChars.add(c);

    // Step 1: Find the 5-char string that encodes 65793 (all unique digits)
    const target5 = [6, 5, 7, 9, 3]; // digits of 65793
    const fiveCharCandidates = strings.filter(
        (s) => s.length === 5 && new Set([...s]).size === 5
    );

    for (const cand5 of fiveCharCandidates) {
        const cipher = {};
        for (let i = 0; i < 5; i++) cipher[cand5[i]] = target5[i];

        // Step 2: Find a 7-char string that encodes 4282663
        const target7a = [4, 2, 8, 2, 6, 6, 3];
        const sevenCharStrings = strings.filter((s) => s.length === 7);

        for (const cand7a of sevenCharStrings) {
            const c2 = { ...cipher };
            let ok = true;
            for (let i = 0; i < 7; i++) {
                const ch = cand7a[i];
                if (c2[ch] !== undefined) {
                    if (c2[ch] !== target7a[i]) { ok = false; break; }
                } else c2[ch] = target7a[i];
            }
            if (!ok) continue;

            // Step 3: Find another 7-char string for 8388607
            const target7b = [8, 3, 8, 8, 6, 0, 7];
            for (const cand7b of sevenCharStrings) {
                if (cand7b === cand7a) continue;
                const c3 = { ...c2 };
                let ok2 = true;
                for (let i = 0; i < 7; i++) {
                    const ch = cand7b[i];
                    if (c3[ch] !== undefined) {
                        if (c3[ch] !== target7b[i]) { ok2 = false; break; }
                    } else c3[ch] = target7b[i];
                }
                if (!ok2) continue;

                // Check we have exactly 10 digit mappings
                const mappedDigits = new Set(Object.values(c3));
                if (mappedDigits.size === 10) {
                    // Find separator from chars in cipher-relevant strings only
                    const cipherCharsD = new Set(Object.keys(c3));
                    const relCharsD = new Set();
                    for (const s of strings) {
                        if ([...s].some((ch) => cipherCharsD.has(ch)))
                            for (const ch of s) relCharsD.add(ch);
                    }
                    const sep = [...relCharsD].find((ch) => c3[ch] === undefined) || null;
                    // Validate: must decode ALL five core constants
                    const foundSet = new Set();
                    const required = [65793, 4282663, 8388607, 65535, 4294967295];
                    for (const s of strings) {
                        const val = decodeStr(s, c3, sep);
                        if (val !== null) foundSet.add(val);
                    }
                    if (required.every((v) => foundSet.has(v))) {
                        return { cipher: c3, separator: sep };
                    }
                }
            }

            // Fallback: try 8888888 (all-same-char 7-char string) + brute remaining
            for (const cand7b of sevenCharStrings) {
                if (cand7b === cand7a) continue;
                if (new Set([...cand7b]).size !== 1) continue;
                const ch8 = cand7b[0];
                const c3 = { ...c2 };
                if (c3[ch8] !== undefined && c3[ch8] !== 8) continue;
                c3[ch8] = 8;

                const mapped = new Set(Object.values(c3));
                const remaining = [];
                for (let d = 0; d <= 9; d++) if (!mapped.has(d)) remaining.push(d);

                // Only consider chars from strings that contain known cipher chars.
                // This avoids pollution from dispatch table arrays.
                const cipherChars = new Set(Object.keys(c3));
                const relevantChars = new Set();
                for (const s of strings) {
                    const hasKnown = [...s].some((ch) => cipherChars.has(ch));
                    if (hasKnown) for (const ch of s) relevantChars.add(ch);
                }
                const unmapped = [...relevantChars].filter((c) => c3[c] === undefined);

                // Try all possible assignments of remaining digits to unmapped chars.
                // One unmapped char is the separator (gets no digit), the rest get digits.
                if (remaining.length <= 3 && unmapped.length >= remaining.length) {
                    // For each unmapped char that could be the separator
                    for (const sepCandidate of unmapped) {
                        const digitChars = unmapped.filter((c) => c !== sepCandidate);
                        if (digitChars.length !== remaining.length) continue;

                        // Try all permutations of remaining digits onto digitChars
                        const perms = permutations(remaining);
                        for (const perm of perms) {
                            const c4 = { ...c3 };
                            for (let i = 0; i < perm.length; i++) c4[digitChars[i]] = perm[i];

                            if (Object.values(c4).filter((v) => typeof v === "number").length !== 10) continue;

                            // Validate: must decode ALL five core constants
                            const foundSet = new Set();
                            const required = [65793, 4282663, 8388607, 65535, 4294967295];
                            for (const s of strings) {
                                const val = decodeStr(s, c4, sepCandidate);
                                if (val !== null) foundSet.add(val);
                            }
                            if (required.every((v) => foundSet.has(v))) {
                                return { cipher: c4, separator: sepCandidate };
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

// ── Decode helper ───────────────────────────────────────────────────────────

function decodeStr(str, cipher, separator) {
    const vp = separator ? str.split(separator)[0] : str;
    if (vp.length === 0) return null;
    let num = "";
    for (const ch of vp) {
        if (cipher[ch] !== undefined) num += cipher[ch];
        else return null; // unmapped char
    }
    return num.length > 0 ? parseInt(num, 10) : null;
}

// ── AST extraction ──────────────────────────────────────────────────────────

function extractSeed1(source) {
    // Parse
    const ast = parser.parse(source, {
        sourceType: "script",
        allowReturnOutsideFunction: true,
        errorRecovery: true,
    });

    // Collect candidate string arrays (20-80 elements)
    const candidateArrays = [];

    traverse(ast, {
        ArrayExpression(path) {
            const elems = path.node.elements;
            if (elems.length < 15 || elems.length > 80) return;

            // Check that most elements are string literals
            const stringElems = elems.filter(
                (e) => e && e.type === "StringLiteral"
            );
            if (stringElems.length < elems.length * 0.9) return;

            const strings = stringElems.map((e) => e.value);
            candidateArrays.push({
                size: strings.length,
                strings,
                loc: path.node.start,
            });
        },
    });

    if (candidateArrays.length === 0) {
        return { error: "No candidate string arrays found" };
    }

    // Filter out dispatch tables: arrays where most strings are exactly 2 chars
    // (these are case-label lookup tables, not encoded constants).
    const cipherArrays = candidateArrays.filter((ca) => {
        const twoCharCount = ca.strings.filter((s) => s.length === 2).length;
        return twoCharCount < ca.strings.length * 0.5;
    });

    // Pool strings from cipher-relevant arrays only
    const allStrings = [];
    for (const ca of (cipherArrays.length > 0 ? cipherArrays : candidateArrays)) {
        allStrings.push(...ca.strings);
    }
    // Deduplicate
    const uniqueStrings = [...new Set(allStrings)];

    // Detect cipher
    const detection = detectCipher(uniqueStrings);
    if (!detection) {
        return { error: "Could not auto-detect cipher", candidateArrays };
    }

    const { cipher, separator } = detection;

    // Decode all strings
    const decoded = [];
    for (const ca of candidateArrays) {
        for (const str of ca.strings) {
            const value = decodeStr(str, cipher, separator);
            if (value !== null) {
                decoded.push({ str, value, arraySize: ca.size, loc: ca.loc });
            }
        }
    }

    // Find seeds[1]: 1M-10M, not known, not all-same-digit (8888888)
    const candidates = decoded.filter((d) => {
        if (d.value < 1000000 || d.value > 9999999) return false;
        if (KNOWN_CONSTANTS.has(d.value)) return false;
        // Exclude all-same-digit numbers (like 8888888, 1111111, etc.)
        const s = String(d.value);
        if (new Set([...s]).size === 1) return false;
        return true;
    });

    // Deduplicate by value
    const uniqueCandidates = [
        ...new Map(candidates.map((c) => [c.value, c])).values(),
    ];

    return {
        cipher,
        separator,
        seed1: uniqueCandidates.length === 1 ? uniqueCandidates[0].value : null,
        candidates: uniqueCandidates.map((c) => ({
            value: c.value,
            encoded: c.str,
            arraySize: c.arraySize,
        })),
        allDecoded: decoded.length,
    };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const file = process.argv[2];
    if (!file) {
        console.error("Usage: node extract_seed1.js <bundle.js>");
        process.exit(1);
    }
    const fs = require("fs");
    const source = fs.readFileSync(file, "utf8");
    const result = extractSeed1(source);

    if (result.error) {
        console.error("Error:", result.error);
        process.exit(1);
    }

    console.log("Cipher:", result.cipher);
    console.log("Separator:", JSON.stringify(result.separator));
    console.log("seeds[1]:", result.seed1);
    if (result.candidates.length > 1) {
        console.log("Multiple candidates:", result.candidates);
    } else if (result.candidates.length === 1) {
        console.log(
            "Encoded as:",
            result.candidates[0].encoded,
            "(in array of",
            result.candidates[0].arraySize,
            "items)"
        );
    }
    console.log("Total decoded values:", result.allDecoded);
}

module.exports = { extractSeed1, detectCipher, decodeStr };
