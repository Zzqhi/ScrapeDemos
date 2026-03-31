/**
 * Static helper for the Akamai `ver` decode chain.
 *
 * Current scope:
 *   1. Read a saved bundle file.
 *   2. Extract the G29 dispatch table.
 *   3. Recover the base numeric constants used by the minified index algebra.
 *   4. Compute the key names used by `Of/W09 case ck`.
 *   5. Extract the getter registration templates for `V5/jj/zb`.
 *   6. Extract the outer `px.call(...)` sites that feed those templates.
 *
 * This does not yet return the final `ver` value.
 * It exists to make the remaining `zT9 -> Of(ck)` work reproducible and
 * remove the repeated manual index arithmetic.
 *
 * Usage:
 *   node extract_ver_static.js <bundle.js>
 */

const fs = require("fs");

function fail(message) {
    throw new Error(message);
}

function readSource(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function extractG29(source) {
    const match = source.match(/function G29\(\)\{var [A-Za-z0-9_$]+=\[([\s\S]*?)\];G29=function\(\)\{return [A-Za-z0-9_$]+;\};return [A-Za-z0-9_$]+;\}/);
    if (!match) fail("Failed to locate G29() table");
    const literals = match[1].match(/'([^']*)'/g) || [];
    const table = literals.map((s) => s.slice(1, -1));
    if (table.length < 50) fail("Unexpected G29() table size");
    return table;
}

function extractBaseValues(source) {
    // Base layer: xw..xJ
    const caseAm = source.match(
        /case AM:\{xw=\+ ! !\[\];Un9\+=qY;c5=xw\+xw;R8=xw\+c5;WH=R8\+xw;jn=R8\+c5;xJ=jn\*xw\+c5;\}break;/
    );
    if (!caseAm) fail("Failed to locate case AM base constants");

    const values = {
        xw: 1,
        c5: 2,
        R8: 3,
        WH: 4,
        jn: 5,
        xJ: 7,
    };

    // Second layer: sW..hC
    const casePv = source.match(
        /case PV:\{sW=xw\*jn-c5\+R8;Np=xJ\*R8-sW\*c5;hS=c5-xJ\+Np\+sW;Un9\+=vG;XB=c5\*WH\+hS\*sW\*Np;wn=\+\[\];gW=xJ\+jn\*R8\+c5\+Np;hC=xJ\+jn-WH\*xw;I3=xJ-R8\+WH\*gW-hC;\}break;/
    );
    if (!casePv) fail("Failed to locate case PV derived constants");

    values.sW = values.xw * values.jn - values.c5 + values.R8;
    values.Np = values.xJ * values.R8 - values.sW * values.c5;
    values.hS = values.c5 - values.xJ + values.Np + values.sW;
    values.wn = 0;
    values.gW = values.xJ + values.jn * values.R8 + values.c5 + values.Np;
    values.hC = values.xJ + values.jn - values.WH * values.xw;
    values.I3 = values.xJ - values.R8 + values.WH * values.gW - values.hC;

    return values;
}

function deriveCaseCkKeys(values, g29) {
    const idx = {
        np: values.xJ - values.Np + values.c5 * values.hC,
        W6: values.R8 - values.xJ * values.xw + values.Np * values.WH,
        dA: values.xw * values.hS + values.c5 * values.jn - values.hC,
        nj: values.Np * values.WH - values.hC - values.xJ + values.hS,
        TC: values.WH + values.jn - values.R8 + values.hS * values.sW,
        Gn: values.sW + values.Np + values.hC - values.WH,
    };

    const names = {};
    for (const [key, index] of Object.entries(idx)) {
        names[key] = g29[index];
    }

    return { idx, names };
}

function extractCaseCkSnippet(source) {
    const marker = "case ck:{var gc=YP[CU];";
    const start = source.indexOf(marker);
    if (start === -1) fail("Failed to locate Of/W09 case ck");
    const end = source.indexOf("}break;case zX:{", start);
    if (end === -1) fail("Failed to slice Of/W09 case ck");
    return source.slice(start, end);
}

function extractByMarkers(source, startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    if (start === -1) fail(`Failed to locate ${label} start`);
    const end = source.indexOf(endMarker, start);
    if (end === -1) fail(`Failed to locate ${label} end`);
    return source.slice(start, end + endMarker.length);
}

function extractRegistrationTemplates(source) {
    return {
        V5: extractByMarkers(
            source,
            "case ZY:{var Rv=cP[CU];vg(Rv[wn]);var Xf=wn;tx=n9;}break;",
            "}break;",
            "V5 registration entry"
        ),
        V5Loop: extractByMarkers(
            source,
            "case n9:{if(mC(Xf,Rv.length)){do{V5()[Rv[Xf]]=fj(vW(Xf,sW))?function(){return kw.apply(this,[Ft,arguments]);}:function(){var Lz=Rv[Xf];return function(DR,cz,Gd){var hB=xS.call(null,DR,Hl,Gd);V5()[Lz]=function(){return hB;};return hB;};}();++Xf;}while(mC(Xf,Rv.length));}tx=I;}break;",
            "}break;",
            "V5 registration loop"
        ),
        jj: extractByMarkers(
            source,
            "case vG:{var Zj9=NC9[CU];Hsr(Zj9[wn]);var Im9=wn;Un9=YG;}break;",
            "}break;",
            "jj registration entry"
        ),
        jjLoop: extractByMarkers(
            source,
            "case YG:{Un9-=YY;while(mC(Im9,Zj9.length)){jj()[Zj9[Im9]]=fj(vW(Im9,Tn))?function(){return kw.apply(this,[GX,arguments]);}:function(){var rj9=Zj9[Im9];return function(c59,gl9){var ll9=ZR(c59,gl9);jj()[rj9]=function(){return ll9;};return ll9;};}();++Im9;}}break;",
            "}break;",
            "jj registration loop"
        ),
        zb: extractByMarkers(
            source,
            "case L2:{var qn9=NC9[CU];dX9(qn9[wn]);var fU9=wn;Un9+=pV;}break;",
            "}break;",
            "zb registration entry"
        ),
        zbLoop: extractByMarkers(
            source,
            "case mX:{while(mC(fU9,qn9.length)){zb()[qn9[fU9]]=fj(vW(fU9,jn))?function(){return kw.apply(this,[qY,arguments]);}:function(){var qJ9=qn9[fU9];return function(VU9,vm9,Qn9){var AA9=zT9(fj(fj(xw)),vm9,Qn9);zb()[qJ9]=function(){return AA9;};return AA9;};}();++fU9;}Un9-=w4;}break;",
            "}break;",
            "zb registration loop"
        ),
    };
}

function extractPxCallsites(source) {
    return {
        bootstrap: extractByMarkers(
            source,
            "case KY:{k49();px.call(this,Q1,[G29()]);VN9=Shr();px.call(this,vG,[G29()]);fr9=Qt;M99=Of(SX,[]);px(rV,[]);D6(jY,[UOr()]);}break;",
            "}break;",
            "px bootstrap callsite"
        ),
        zt9Memo: extractByMarkers(
            source,
            "case qY:{zT9.c9=W99[w3];fr9=V9;px.call(this,L2,[eS1_xor_3_memo_array_init()]);return '';}break;",
            "}break;",
            "zT9 memo callsite"
        ),
        zrMemo: extractByMarkers(
            source,
            "case GX:{fr9=V9;ZR.b9=VN9[vp];px.call(this,vG,[eS1_xor_0_memo_array_init()]);return '';}break;",
            "}break;",
            "ZR memo callsite"
        ),
        xsMemo: extractByMarkers(
            source,
            "case HT:{Hz.xX=JK[kz];px.call(this,Q1,[eS1_xor_1_memo_array_init()]);return '';}break;",
            "}break;",
            "xS memo callsite"
        ),
    };
}

function analyzeBundle(source) {
    const g29 = extractG29(source);
    const values = extractBaseValues(source);
    const caseCk = deriveCaseCkKeys(values, g29);

    return {
        baseValues: values,
        caseCkIndexes: caseCk.idx,
        caseCkKeys: caseCk.names,
        caseCkSnippet: extractCaseCkSnippet(source),
        registrationTemplates: extractRegistrationTemplates(source),
        pxCallsites: extractPxCallsites(source),
    };
}

function main() {
    const bundlePath = process.argv[2];
    if (!bundlePath) {
        console.error("Usage: node extract_ver_static.js <bundle.js>");
        process.exit(1);
    }

    const source = readSource(bundlePath);
    const result = analyzeBundle(source);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    analyzeBundle,
    deriveCaseCkKeys,
    extractBaseValues,
    extractCaseCkSnippet,
    extractG29,
    extractPxCallsites,
    extractRegistrationTemplates,
};
