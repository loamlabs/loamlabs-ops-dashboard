// lib/order-sheet-view.js
// Order sheet (dashboard side): the pure logic. No network, no React. The sheet itself is made by Backend 1's endpoint (loamlabs-spoke-automation api/order-sheet.js).
// This file only (1) checks an order number, (2) turns Backend 1's answers into readable messages, (3) turns the sheet JSON into a view model and a copy-as-text,
// using a WHITELIST of fields: a field that is not listed here (for example a customer field that should never be there) cannot be shown. findForbiddenKeys is the second guard.

/** the order number: digits only (a leading # is accepted), 1 to 9 digits; null when it is not one */
function normalizeOrderNumber(input) {
    const s = String(input == null ? '' : input).trim().replace(/^#/, '');
    return /^\d{1,9}$/.test(s) ? s : null;
}

// key names that must never appear in a sheet that is returned or shown (customer data)
const FORBIDDEN_KEYS = ['email', 'contact_email', 'phone', 'address', 'address1', 'address2', 'shipping_address', 'billing_address', 'customer', 'first_name', 'last_name', 'firstname', 'lastname', 'note', 'note_attributes', 'browser_ip', 'client_details', 'ip'];
/** the paths of any key named like customer data, anywhere in an object (case-insensitive) */
function findForbiddenKeys(value, path = '$', out = []) {
    if (Array.isArray(value)) value.forEach((v, i) => findForbiddenKeys(v, `${path}[${i}]`, out));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (FORBIDDEN_KEYS.includes(k.toLowerCase())) out.push(`${path}.${k}`); findForbiddenKeys(v, `${path}.${k}`, out); }
    return out;
}

/** Backend 1's answers as sentences for the screen. status = HTTP status, body = parsed JSON or null. */
function messageFor(status, body) {
    const code = body && body.error;
    const BY_CODE = {
        DASHBOARD_UNAUTHORIZED: 'You are not signed in to the dashboard. Sign in again.',
        SETUP_MISSING: 'Order sheet setup is missing on the dashboard: ORDER_SHEET_SECRET or ORDER_SHEET_BASE_URL is not set (see the setup steps).',
        BAD_ORDER_NUMBER: 'That is not an order number. Type digits only, for example 1466.',
        UNAUTHORIZED: 'The order sheet service did not accept the shared secret: ORDER_SHEET_SECRET is not set, or it differs between the dashboard and the spoke-automation project (setup steps).',
        ORDER_NOT_FOUND: 'No order with that number was found.',
        NO_SUCH_IMAGE: 'This order has no such picture.',
        NOT_A_BUILDER_ORDER: 'This order has no wheel build, so there is no order sheet for it.',
        SHOPIFY_ERROR: 'Shopify did not answer in time. Try again in a moment.',
        DRAW_FAILED: 'The picture could not be drawn. Try again; if it keeps failing, tell Backend 1.',
        PRIVACY_BLOCK: 'The sheet was blocked because it contained customer data. Nothing was shown. Tell Backend 1.',
        UNREACHABLE: 'The order sheet service could not be reached. Try again in a moment.',
    };
    if (code && Object.prototype.hasOwnProperty.call(BY_CODE, code)) return BY_CODE[code];
    // no known code: fall back to the HTTP status
    if (status === 400) return BY_CODE.BAD_ORDER_NUMBER;
    if (status === 401) return BY_CODE.UNAUTHORIZED;
    if (status === 404) return BY_CODE.ORDER_NOT_FOUND;
    if (status === 422) return BY_CODE.NOT_A_BUILDER_ORDER;
    if (status === 502 || status === 504) return BY_CODE.SHOPIFY_ERROR;
    if (status >= 500) return 'The order sheet service had a problem. Try again in a moment.';
    return 'The order sheet could not be loaded.';
}

const SIDE_NAME = { drive: 'Drive', rotor: 'Rotor' };
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const str = (v) => (v === null || v === undefined ? '' : String(v));

/** 12-hour Eastern, "Nov 12, 3:04 PM EST" */
function dateEst(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
}

/** red/amber while the numbers were recalculated now, neutral when they are the saved copy ("as sent") */
function calcTone(calculation) { return calculation && calculation.mode === 'saved' ? 'neutral' : 'amber'; }

const I9_CART_PREFIX = 'https://b2b.industrynine.com/cart/';
/** a link is only offered when it is an I9 B2B cart link; it is shown as a normal link the person clicks, never opened by the page */
function safeCartLink(url) { return typeof url === 'string' && url.startsWith(I9_CART_PREFIX) && /^[\x21-\x7e]+$/.test(url) ? url : null; }

/** spokes on one side: the number Backend 1 sent; else, only when it is certain (a 1:1 wheel with an even total), the total divided by 2; else null. Never invented. */
function sideCount(w, s) {
    if (typeof s.count === 'number' && s.count > 0) return s.count;
    const total = Number(w.total);
    if (String(w.ratio) === '1:1' && Number.isInteger(total) && total > 0 && total % 2 === 0) return total / 2;
    return null;
}
function sideLine(w, side) {
    const s = w.sides && w.sides[side]; if (!s) return null;
    const colors = (s.counts || []).map((c) => `${c.n} ${str(c.color)}`).join(', ');
    return { side, label: SIDE_NAME[side] || cap(side), high: w.highSide === side, low: w.lowSide === side, count: sideCount(w, s), lengthMm: typeof s.lengthMm === 'number' ? s.lengthMm : null, colors };
}
/** "Rotor side (high tension): 14 spokes, 305 mm, 7 Black, 7 Bronze"; a missing count or length is left out, never printed empty */
function sideText(s) {
    const parts = [s.count !== null && s.count !== undefined ? `${s.count} spokes` : null, s.lengthMm ? `${s.lengthMm} mm` : null, s.colors || null].filter(Boolean);
    return `${s.label} side${s.high ? ' (high tension)' : s.low ? ' (low tension)' : ''}${parts.length ? ': ' + parts.join(', ') : ''}`;
}
const NO_STUDIO_LINE = 'No per-spoke list or pictures for this order: it was not built with the colour tool.';
/** true unequal sides: both side counts are known numbers and differ (Solix 24h: 16 drive / 8 rotor) */
function hasUnequalSides(w) {
    const a = w.sides && w.sides.drive && w.sides.drive.count, b = w.sides && w.sides.rotor && w.sides.rotor.count;
    return typeof a === 'number' && typeof b === 'number' && a !== b;
}

/** The view model of one sheet (whitelisted fields only). */
const ORDER_LIST_STATUSES = ['present', 'not-applicable', 'not-saved', 'error'];
/** which state the I9 order list is in: the answer's own status first, then the sheet's; an old saved System sheet with only the PR 1 field is 'legacy' (old card keeps working) */
function orderListStatusOf(sheet, responseStatus) {
    if (ORDER_LIST_STATUSES.includes(responseStatus)) return responseStatus;
    if (sheet && ORDER_LIST_STATUSES.includes(sheet.orderListStatus)) return sheet.orderListStatus;
    if (sheet && sheet.orderList) return 'present';
    if (sheet && sheet.i9OrderList) return 'legacy';
    return sheet && sheet.kind === 'system' ? 'not-saved' : 'not-applicable';
}
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const noBracket = (line) => str(line).replace(/\s*\[[^\]]*\]\s*$/, '').trim();
/** the structured I9 order list (Backend 1 sheet.orderList) as plain values for the page; whitelist again, lengths are only passed through, never recalculated */
function buildOrderList(ol) {
    if (!ol || typeof ol !== 'object') return null;
    const S = ol.sections || {};
    const entry = (e) => { e = e || {}; const n = numOrNull(e.n), spare = numOrNull(e.spare) || 0, qty = numOrNull(e.qty); return { color: str(e.color), n, spare, qty: qty === null ? (n === null ? null : n + spare) : qty, outOfStock: !!e.outOfStock, reason: str(e.reason), reasonText: str(e.reasonText) }; };
    const side = (s) => { s = s || {}; return { position: str(s.position), positionLabel: cap(s.position), side: str(s.side), sideLabel: SIDE_NAME[s.side] || cap(s.side), lengthMm: numOrNull(s.lengthMm), baseColor: str(s.baseColor), baseColorNote: str(s.baseColorNote), entries: (s.entries || []).map(entry) }; };
    const head = (sec, fallback) => noBracket(((sec && sec.lines) || [])[0]) || fallback;
    const wheelText = (w) => ({ position: str(w && w.position), positionLabel: cap(w && w.position), text: str(w && w.text), customerSupplied: !!(w && w.customerSupplied), i9Code: str(w && w.i9Code), color: str(w && w.color) });
    const pre = S.prebuilt || {}, dl = S.dealerSpokes || {}, em = S.orderByEmail || {}, hb = S.hubs || {}, rm = S.rims || {};
    const cart = dl.cartLink && typeof dl.cartLink === 'object' ? { url: safeCartLink(dl.cartLink.url), adds: str(dl.cartLink.adds), totals: dl.cartLink.totals ? { spokes: numOrNull(dl.cartLink.totals.spokes), spares: numOrNull(dl.cartLink.totals.spares) } : null, outOfStockItems: (dl.cartLink.items || []).filter((i) => i && i.available === false).length } : null;
    const checkLine = ((dl.lines || []).map(str).find((l) => /^\s*check the cart/i.test(l)) || '').trim();
    return {
        orderNumber: str(ol.orderNumber), snapshotDate: str(ol.snapshotDate), text: str(ol.text), cartUrl: safeCartLink(ol.cartLink) || (cart && cart.url) || null, cartAdds: str(ol.cartLinkAdds) || (cart ? cart.adds : ''), emailText: str(ol.orderByEmailText),
        prebuilt: { title: head(pre, 'A. PRE-BUILT WHEELS'), none: !!pre.none, lines: ((pre.lines || []).slice(1)).map((l) => str(l).trim()), wheels: (pre.wheels || []).map(wheelText) },
        dealer: { title: head(dl, "B. SPOKES on I9's dealer list, with spares"), sides: (dl.sides || []).map(side), noLength: (dl.noLength || []).map(side), cart, checkLine, hasAnything: (dl.sides || []).length > 0 || (dl.noLength || []).length > 0 },
        email: { title: head(em, 'C. SPOKES NOT on the dealer list: ORDER BY EMAIL OR PHONE'), to: str(em.to), message: str(em.message) || str(ol.orderByEmailText), sides: (em.sides || []).map(side) },
        hubs: { title: head(hb, 'D. HUBS (from I9)'), wheels: (hb.wheels || []).map(wheelText) },
        rims: { title: head(rm, 'E. RIMS (from I9)'), wheels: (rm.wheels || []).map(wheelText) },
    };
}

function buildView(sheet, responseStatus) {
    const calc = sheet.calculation || {};
    const header = {
        orderName: str(sheet.orderName || ('#' + sheet.orderNumber)), orderNumber: str(sheet.orderNumber), date: dateEst(sheet.orderCreatedAt), cancelled: !!sheet.orderCancelled,
        buildId: str(sheet.buildId), kind: sheet.kind === 'system' ? 'Industry Nine System' : 'Standard', calcText: str(calc.text), calcMode: str(calc.mode), calcTone: calcTone(calc),
        numberingLabel: str(sheet.numbering && sheet.numbering.label), numberingRule: str(sheet.numbering && sheet.numbering.rule),
    };
    const wheels = (sheet.wheels || []).map((w) => {
        const lengths = w.lengths || {};
        const sides = ['rotor', 'drive'].map((s) => sideLine(w, s)).filter(Boolean);
        const highLow = (w.highSide && w.lowSide) ? { high: w.highSide, low: w.lowSide } : null;
        const listsOrder = highLow ? [highLow.high, highLow.low] : ['rotor', 'drive'];
        return {
            position: str(w.position), title: str(w.label || cap(w.position)),
            facts: [['Hub', [w.hubTitle, w.hubVariantTitle].filter(Boolean).join(' - ') || str(w.hubModel)], ['Rim', str(w.rimTitle)], ['Spokes', str(w.spokeCountLabel)], ['Ratio', str(w.ratio)], ['Hub color', str(w.hubColor)], ['Freehub', str(w.freehub)],
                ['High-tension side', highLow ? SIDE_NAME[highLow.high] : (hasUnequalSides(w) ? 'n/a (unequal sides)' : '')], ['Low-tension side', highLow ? SIDE_NAME[highLow.low] : (hasUnequalSides(w) ? 'n/a (unequal sides)' : '')]].filter(([, v]) => v),
            sides, lengthStatus: str(lengths.status), lengthsText: str(lengths.text), lengthsCaveat: str(lengths.caveat), sourceText: str(lengths.sourceText),
            notCalculated: lengths.status === 'not-calculated',
            images: (w.images || []).map((im) => ({ wheel: str(im.wheel || w.position), view: str(im.view), caption: str(im.caption) })),
            spokes: (w.spokes || []).map((sp) => ({ number: sp.number, text: str(sp.text), side: str(sp.side), sideLabel: SIDE_NAME[sp.side] || cap(sp.side), color: str(sp.color), high: !!sp.high })),
            lists: listsOrder.map((side) => ({ side, label: `${SIDE_NAME[side] || cap(side)} side${highLow ? (highLow.high === side ? ' (high tension)' : ' (low tension)') : ''}`, items: ((w.lists || {})[side] || []).map((it) => ({ text: str(it.text), color: str(it.color) })) })),
            supplied: w.supplied ? (typeof w.supplied === 'string' ? w.supplied : str(w.supplied.text)) : '', warnings: (w.warnings || []).map(str),
            hasDetail: (w.spokes || []).length > 0 || (w.images || []).length > 0 || Object.values(w.lists || {}).some((l) => (l || []).length > 0),
        };
    });
    const i9 = sheet.i9OrderList ? { text: str(sheet.i9OrderList.text), linkUrl: safeCartLink(sheet.i9OrderList.linkUrl), linkAdds: str(sheet.i9OrderList.linkAdds), thomasText: str(sheet.i9OrderList.thomasText), snapshotDate: str(sheet.i9OrderList.snapshotDate) } : null;
    const orderListStatus = orderListStatusOf(sheet, responseStatus);
    return {
        orderListStatus, orderListNote: str(sheet.orderListNote), orderList: orderListStatus === 'present' ? buildOrderList(sheet.orderList) : null,
        header, wheels, warnings: (sheet.warnings || []).map(str), orderChecks: (sheet.orderChecks || []).map((c) => (typeof c === 'string' ? c : str(c && c.text))),
        supplied: sheet.customerSupplied ? { text: str(sheet.customerSupplied.text), reminder: str(sheet.customerSupplied.reminder) } : null, i9,
        chartSources: [...new Set(wheels.map((w) => w.sourceText).filter(Boolean))],
        noStudioLine: NO_STUDIO_LINE, noStudioAll: wheels.length > 0 && wheels.every((w) => !w.hasDetail),
    };
}

/** plain text for "Copy as text": header, per wheel the lengths and the per-spoke list. Same whitelist as the view. */
function sheetToText(sheet) {
    const v = buildView(sheet); const out = [];
    out.push(`ORDER SHEET ${v.header.orderName}  (${v.header.kind})`);
    if (v.header.date) out.push(`Ordered: ${v.header.date}`); if (v.header.buildId) out.push(`Build id: ${v.header.buildId}`);
    out.push(`Lengths: ${v.header.calcText}`); out.push(`Spoke numbering: ${v.header.numberingLabel}`); if (v.header.numberingRule) out.push(v.header.numberingRule);
    for (const w of v.wheels) {
        out.push('', `${w.title.toUpperCase()}`, ...w.facts.map(([k, val]) => `${k}: ${val}`));
        out.push(w.lengthsText || '(no length text)'); if (w.lengthsCaveat) out.push(w.lengthsCaveat); if (w.sourceText) out.push(w.sourceText);
        w.sides.forEach((s) => out.push(sideText(s)));
        if (w.hasDetail) {
            out.push('Spoke  Side   Color'); w.spokes.forEach((sp) => out.push(`${String(sp.text).padEnd(6)} ${sp.sideLabel.padEnd(6)} ${sp.color}`));
            w.lists.forEach((l) => out.push(`${l.label}: ${l.items.map((i) => i.text + ' ' + i.color).join(', ')}`));
        } else if (!v.noStudioAll) out.push(NO_STUDIO_LINE);
        if (w.supplied) out.push(w.supplied); w.warnings.forEach((x) => out.push('WARNING: ' + x));
    }
    if (v.noStudioAll) out.push('', NO_STUDIO_LINE);
    v.warnings.forEach((x) => out.push('', 'WARNING: ' + x)); v.orderChecks.forEach((x) => out.push('CHECK: ' + x));
    if (v.supplied) out.push('', v.supplied.text, v.supplied.reminder);
    return out.filter((l) => l !== undefined && l !== null).join('\n');
}

/** the url path the browser asks the dashboard for one image (the dashboard adds the secret on the server) */
function imagePath(orderNumber, im, width = 600) {
    const q = new URLSearchParams({ order: String(orderNumber), wheel: im.wheel, view: im.view || 'all', width: String(width) });
    return `/api/order-sheet-image?${q.toString()}`;
}

/** the per-spoke rows for the PRINTED two-column table: the first half (rounded up) and the rest, in the same order; together exactly the screen table's rows, none lost, none repeated */
function splitForPrint(spokes) {
    const list = Array.isArray(spokes) ? spokes : []; const n = Math.ceil(list.length / 2);
    return list.length ? [list.slice(0, n), list.slice(n)] : [];
}

module.exports = { orderListStatusOf, buildOrderList, splitForPrint, sideText, sideCount, NO_STUDIO_LINE, normalizeOrderNumber, FORBIDDEN_KEYS, findForbiddenKeys, messageFor, dateEst, calcTone, safeCartLink, buildView, sheetToText, imagePath };
