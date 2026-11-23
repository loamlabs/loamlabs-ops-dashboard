// Makes the 8 FAKE Hoss product pages in this folder (made-up SKUs, made-up stock numbers; same shape and variant counts as the real pages). Run: node tests/fixtures/alpina/make-fake-fixtures.js
// Nothing here comes from Hoss: stock is a fixed pattern (about 1 in 5 variants out of stock, about 1 in 7 low, the rest well stocked).
const fs = require('fs'); const path = require('path');
const PAGES = [   // key, title, first length, last length
    ['extralite-round-j-bend', 'Alpina Extralite Round J-Bend', 120, 310], ['extralite-round-straight-pull', 'Alpina Extralite Round Straight-Pull', 120, 310],
    ['extralite-aero-j-bend', 'Alpina Extralite Aero J-Bend', 220, 310], ['extralite-aero-straight-pull', 'Alpina Extralite Aero Straight-Pull', 220, 310],
    ['ultralite-round-j-bend', 'Alpina Ultralite Round J-Bend', 120, 310], ['ultralite-round-straight-pull', 'Alpina Ultralite Round Straight-Pull', 176, 310],
    ['ultralite-aero-j-bend', 'Alpina Ultralite Aero J-Bend', 150, 310], ['ultralite-aero-straight-pull', 'Alpina Ultralite Aero Straight-Pull', 150, 310],
];
const enc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stockOf = (i) => (i % 5 === 0 ? 0 : i % 7 === 0 ? 1 + ((i * 3) % 13) : 40 + ((i * 17) % 160));
let vid = 9000;
for (const [key, title, from, to] of PAGES) {
    const list = []; let i = 0;
    for (let len = from; len <= to; len += 2) for (const color of ['Silver', 'Black']) {
        i++; const qty = stockOf(i + key.length); vid++;
        list.push({ attributes: { attribute_color: color, attribute_length: len + 'mm' }, availability_html: qty ? `<p class="stock in-stock">${qty} in stock</p>\n` : '<p class="stock out-of-stock">Out of stock</p>\n', is_in_stock: qty > 0, max_qty: qty > 0 ? qty : '', sku: `FAKE-${key}-${color[0]}${len}`, variation_id: vid });
    }
    fs.writeFileSync(path.join(__dirname, key + '.html'), '<!doctype html><html><head><title>' + title + ' – Hoss Active Sports Group</title></head><body><form class="variations_form cart" data-product_variations="' + enc(JSON.stringify(list)) + '"></form></body></html>');
}
console.log('8 fake pages written');
