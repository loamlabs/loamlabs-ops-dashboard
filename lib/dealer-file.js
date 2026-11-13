// lib/dealer-file.js
// Reads a dealer price/stock FILE (CSV or XLSX) into normalized rows. Pure: no network, no disk, no secrets, never throws on a bad row.
//   readDealerFile(input, { format, mapping, sheet, headerRow }) -> { ok, format, columns, headerRow, rows, warnings }
//     row = { reference, description, msrp, map, dealerCost, qty, raw, line }   (money in dollars as numbers, qty as a whole number, null when the file has no value)
//   `mapping` names the file's columns by header text, for example { reference: 'Part Number', qty: 'On hand' }; anything not named is auto-detected from common headers.
//   Columns that are not used stay in `raw` (every cell, keyed by the header text).
// XLSX is read with Node's own zlib (a .xlsx is a zip of XML files), so no new package is needed. Only the first sheet (or `sheet`: name or 0-based number), plain cell values.
const zlib = require('zlib');

const FIELDS = ['reference', 'description', 'msrp', 'map', 'dealerCost', 'qty'];
// header text, lowercased with everything except letters and digits removed
const SYNONYMS = {
    reference: ['reference', 'ref', 'item', 'itemno', 'itemnumber', 'itemcode', 'sku', 'partnumber', 'partno', 'part', 'pn', 'mpn', 'code', 'productcode', 'article', 'articlecode', 'articlenumber', 'modelnumber'],
    description: ['description', 'desc', 'itemdescription', 'productdescription', 'name', 'productname', 'title', 'model'],
    msrp: ['msrp', 'msrpusd', 'retail', 'retailprice', 'listprice', 'list', 'srp', 'suggestedretail', 'suggestedretailprice', 'rrp'],
    map: ['map', 'mapprice', 'mapusd', 'minimumadvertisedprice', 'minadvertisedprice', 'minadvprice', 'minimumadvprice'],
    dealerCost: ['cost', 'dealercost', 'dealerprice', 'dealernet', 'wholesale', 'wholesaleprice', 'net', 'netprice', 'yourprice', 'unitcost', 'unitprice', 'price'],
    qty: ['qty', 'quantity', 'available', 'availableqty', 'qtyavailable', 'stock', 'onhand', 'qtyonhand', 'inventory', 'instock', 'stocklevel', 'avail'],
};
// 'price' alone is the dealer's price only when no clearer cost column exists (it is last in the list and only used then)
const norm = (s) => String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (s) => String(s === null || s === undefined ? '' : s).replace(/[ ​﻿]/g, ' ').trim();

// ---------- numbers ----------
/** "$1,489.00", " 1 489,00 ", "USD 12.5", "1.489,00 EUR", "(5.00)" -> number; "", "-", "N/A" -> null; garbage -> NaN */
function parseMoney(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let s = clean(v); if (!s || /^(-+|n\/?a|null|none|tbd|call)$/i.test(s)) return null;
    let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[^\d.,\-\s]/g, '').replace(/\s+/g, '').trim(); if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    let dec = null;
    if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? '.' : ',';
    else if (lastComma >= 0) dec = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? ',' : null;   // "12,50" decimal; "1,489" or "1,489,000" thousands
    else if (lastDot >= 0) dec = /\.\d{1,2}$/.test(s) && s.indexOf('.') === lastDot ? '.' : (/^\d{1,3}(\.\d{3})+$/.test(s) ? null : '.');
    let out = dec ? s.replace(dec === '.' ? /,/g : /\./g, '').replace(dec, '.') : s.replace(/[.,]/g, '');
    const n = Number(out); if (!Number.isFinite(n)) return NaN;
    return Math.round((neg ? -n : n) * 100) / 100;
}
/** "12", "1,200", "12.0", "10+", ">5" -> whole number; "" -> null; text -> NaN */
function parseQty(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : NaN;
    const s = clean(v); if (!s || /^(-+|n\/?a|null)$/i.test(s)) return null;
    const t = s.replace(/^[><=\s]+|[+\s]+$/g, '').replace(/,(?=\d{3}\b)/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    return Math.round(Number(t));
}

// ---------- CSV ----------
function guessDelimiter(text) {
    const head = text.split(/\r?\n/).slice(0, 5).join('\n'); let best = ',', n = -1;
    for (const d of [',', ';', '\t', '|']) { let c = 0, q = false; for (const ch of head) { if (ch === '"') q = !q; else if (ch === d && !q) c++; } if (c > n) { n = c; best = d; } }
    return best;
}
/** RFC 4180: quotes, doubled quotes, line breaks inside quotes, BOM, CRLF or LF, delimiter , ; tab | */
function parseCsv(input, delimiter) {
    const text = String(input).replace(/^﻿/, ''); const d = delimiter || guessDelimiter(text);
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
        else if (ch === '"' && cell.trim() === '') { q = true; cell = ''; }
        else if (ch === d) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
        else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// ---------- XLSX (zip + XML) ----------
function unzip(buf) {
    // end of central directory
    let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('not a zip file');
    const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = {};
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8'); p += 46 + nlen + xlen + clen;
        const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28), start = off + 30 + lnlen + lxlen;
        files[name] = () => { const raw = buf.slice(start, start + csize); if (usize > 50 * 1024 * 1024) throw new Error('zip entry too large'); return method === 0 ? raw : zlib.inflateRawSync(raw); };
    }
    return files;
}
const unxml = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml) => [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');
const colIndex = (ref) => { const m = /^([A-Z]+)/i.exec(ref); let n = 0; for (const c of m[1].toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

function parseXlsx(buf, sheet) {
    const files = unzip(buf); const get = (n) => (files[n] ? files[n]().toString('utf8') : null);
    const wb = get('xl/workbook.xml'); if (!wb) throw new Error('no workbook in the file');
    const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unxml((/name="([^"]*)"/.exec(m[0]) || [])[1] || ''), rid: (/r:id="([^"]*)"/.exec(m[0]) || [])[1] }));
    if (!sheets.length) throw new Error('the workbook has no sheets');
    const rels = get('xl/_rels/workbook.xml.rels') || ''; const target = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = (/\bId="([^"]*)"/.exec(m[0]) || [])[1], t = (/Target="([^"]*)"/.exec(m[0]) || [])[1]; if (id && t) target[id] = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
    const pick = typeof sheet === 'number' ? sheets[sheet] : (sheet ? sheets.find((s) => s.name === sheet) : sheets[0]); if (!pick) throw new Error('sheet not found: ' + sheet);
    const sheetXml = get(target[pick.rid] || 'xl/worksheets/sheet1.xml'); if (!sheetXml) throw new Error('sheet data missing');
    const sst = get('xl/sharedStrings.xml'); const shared = sst ? [...sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
    const rows = [];
    for (const rm of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rowNum = Number((/\br="(\d+)"/.exec(rm[0]) || [])[1]) || rows.length + 1; const cells = [];
        for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = cm[1], inner = cm[2] || ''; const ref = (/\br="([A-Z]+\d+)"/i.exec(attrs) || [])[1]; if (!ref) continue; const type = (/\bt="([^"]*)"/.exec(attrs) || [])[1];
            const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1]; let val = '';
            if (type === 's') val = shared[Number(v)] === undefined ? '' : shared[Number(v)];
            else if (type === 'inlineStr') val = textOf(inner);
            else if (v !== undefined) val = type === 'str' || type === 'e' || type === 'b' ? unxml(v) : unxml(v);
            cells[colIndex(ref)] = val;
        }
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
        rows[rowNum - 1] = cells;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
}

// ---------- headers and rows ----------
function detectColumns(headerCells, mapping) {
    const heads = headerCells.map((h) => ({ text: clean(h), n: norm(h) })); const used = new Set(); const cols = {}; const notes = [];
    for (const f of FIELDS) { // 1) the mapping wins (header text, compared without case or punctuation)
        const want = mapping && mapping[f]; if (want === undefined || want === null || want === '') continue;
        const i = typeof want === 'number' ? want : heads.findIndex((h, k) => !used.has(k) && h.n && h.n === norm(want));
        if (i >= 0 && i < heads.length) { cols[f] = i; used.add(i); } else notes.push(`mapping: column "${want}" for ${f} was not found in the file's header row`);
    }
    for (const f of FIELDS) { // 2) auto-detect; the earlier synonym is the better match
        if (cols[f] !== undefined) continue; if (mapping && mapping[f] !== undefined && mapping[f] !== null && mapping[f] !== '') continue;
        let found = -1; for (const syn of SYNONYMS[f]) { const i = heads.findIndex((h, k) => !used.has(k) && h.n === syn); if (i >= 0) { found = i; break; } }
        if (found >= 0) { cols[f] = found; used.add(found); if (f === 'dealerCost' && norm(heads[found].text) === 'price') notes.push('the column "' + heads[found].text + '" is read as the dealer cost (no clearer cost column); check it, or give a column mapping'); }
    }
    return { cols, notes };
}
const recognised = (cells) => { const set = new Set(); for (const c of cells) { const n = norm(c); for (const f of FIELDS) if (SYNONYMS[f].includes(n)) set.add(f); } return set.size; };

function readDealerFile(input, options = {}) {
    const warnings = []; const fail = (msg) => ({ ok: false, format: null, columns: {}, headerRow: null, rows: [], warnings: [msg].concat(warnings) });
    let table, format = options.format;
    try {
        const buf = Buffer.isBuffer(input) ? input : (input instanceof Uint8Array ? Buffer.from(input) : null);
        if (!format) format = buf && buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b ? 'xlsx' : 'csv';
        if (format === 'xlsx') {
            if (!buf) return fail('an .xlsx file must be given as bytes');
            if (options.sheet !== undefined && options.sheet !== null) table = parseXlsx(buf, options.sheet);
            else { // no sheet named: the first sheet that has a known header row (a cover or notes sheet in front is skipped)
                table = parseXlsx(buf, 0);
                if (!table.slice(0, 15).some((r) => recognised(r || []) >= 2)) for (let i = 1; i < 12; i++) { let t2; try { t2 = parseXlsx(buf, i); } catch (e) { break; } if (t2.slice(0, 15).some((r) => recognised(r || []) >= 2)) { table = t2; warnings.push('read sheet number ' + (i + 1) + ' (the first sheets have no price list headers)'); break; } }
            }
        }
        else table = parseCsv(buf ? buf.toString('utf8') : String(input === undefined || input === null ? '' : input), options.delimiter);
    } catch (e) { return fail('the file could not be read as ' + (format || 'csv') + ': ' + (e && e.message ? e.message : e)); }

    // header row: the given one, or the first of the top 15 rows that shows at least two known headers (title lines above the table are skipped)
    let h = Number.isInteger(options.headerRow) ? options.headerRow : -1;
    if (h < 0) { for (let i = 0; i < Math.min(15, table.length); i++) if (recognised(table[i] || []) >= 2) { h = i; break; } }
    if (h < 0) { h = table.findIndex((r) => (r || []).some((c) => clean(c))); if (h < 0) return fail('the file is empty'); warnings.push('no known column headers found: using the first non-empty line as the header row; give a column mapping'); }
    const header = (table[h] || []).map(clean); const { cols, notes } = detectColumns(header, options.mapping || {}); warnings.push(...notes);
    if (cols.reference === undefined) return fail('no reference column found (looked for item / SKU / part number / reference); give a column mapping');
    for (const f of ['msrp', 'map', 'dealerCost', 'qty']) if (cols[f] === undefined) warnings.push(`no ${f === 'dealerCost' ? 'cost' : f === 'qty' ? 'quantity' : f.toUpperCase()} column in this file`);
    const used = new Set(Object.values(cols)); const rows = [];
    for (let i = h + 1; i < table.length; i++) {
        const cells = table[i] || []; if (!cells.some((c) => clean(c) !== '')) continue; const line = i + 1;
        const raw = {}; header.forEach((name, k) => { if (!used.has(k) && (name || clean(cells[k]))) raw[name || `column ${k + 1}`] = clean(cells[k]); });
        const ref = clean(cells[cols.reference]).replace(/\s+/g, ' ');
        if (!ref) { warnings.push(`line ${line}: no reference, row skipped`); continue; }
        const row = { reference: ref, description: cols.description !== undefined ? clean(cells[cols.description]).replace(/\s+/g, ' ') : '', msrp: null, map: null, dealerCost: null, qty: null, raw, line };
        for (const [f, parse] of [['msrp', parseMoney], ['map', parseMoney], ['dealerCost', parseMoney], ['qty', parseQty]]) {
            if (cols[f] === undefined) continue; const v = parse(cells[cols[f]]);
            if (typeof v === 'number' && Number.isNaN(v)) { warnings.push(`line ${line} (${ref}): ${f === 'dealerCost' ? 'cost' : f} "${clean(cells[cols[f]])}" is not a number, left empty`); continue; }
            if (v !== null && v < 0) { warnings.push(`line ${line} (${ref}): negative ${f === 'dealerCost' ? 'cost' : f} ${v}, left empty`); continue; }
            row[f] = v;
        }
        rows.push(row);
    }
    if (!rows.length) warnings.push('the file has a header row but no data rows');
    const columns = {}; for (const f of FIELDS) if (cols[f] !== undefined) columns[f] = header[cols[f]] || `column ${cols[f] + 1}`;
    return { ok: rows.length > 0, format, columns, headerRow: h + 1, rows, warnings };
}

module.exports = { FIELDS, parseMoney, parseQty, parseCsv, parseXlsx, readDealerFile };
