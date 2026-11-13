// TEST HELPER: builds a tiny .xlsx (a zip of XML files) from rows of cells, with Node's own zlib. Made-up data only.
//   makeXlsx([[ 'a', 1, { inline: 'text' } ], ...], { sheetName, shared: true })  -> Buffer
const zlib = require('zlib');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

function zip(files) {
    const parts = []; const central = []; let offset = 0;
    for (const [name, data] of Object.entries(files)) {
        const nameBuf = Buffer.from(name); const raw = Buffer.from(data); const comp = zlib.deflateRawSync(raw); const crc = zlib.crc32(raw);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
        parts.push(lh, nameBuf, comp);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf); offset += 30 + nameBuf.length + comp.length;
    }
    const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, end]);
}

function makeXlsx(rows, { sheetName = 'Price list', shared = true } = {}) {
    const strings = []; const sid = (s) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
    const sheetRows = rows.map((cells, r) => `<row r="${r + 1}">` + cells.map((c, i) => {
        if (c === null || c === undefined || c === '') return '';
        const ref = colName(i) + (r + 1);
        if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
        if (c && typeof c === 'object' && c.inline !== undefined) return `<c r="${ref}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
        return shared ? `<c r="${ref}" t="s"><v>${sid(String(c))}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const files = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
        'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Notes" sheetId="2" r:id="rId9"/><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Type="x" Target="worksheets/sheet2.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
        'xl/worksheets/sheet2.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Just a note sheet</t></is></c></row></sheetData></worksheet>',
    };
    if (shared) files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
    return zip(files);
}

module.exports = { makeXlsx };
