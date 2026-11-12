// Run with: npm test  (library grid: after a save, one click must select one cell, three times in a row, with and without a filter)
const test = require('node:test');
const assert = require('node:assert/strict');
const { hydrateRows, rowIdOf } = require('../lib/component-rows');

// rows as they come from the library file: several sizes / variants of one product share a product id
const FILE = [
  { Title: 'DT Swiss FR 571 Aluminum 29"', Vendor: 'DT Swiss', 'Option1 Value': '28h', shopify_product_id: 9001, ERD: 595 },
  { Title: 'DT Swiss FR 571 Aluminum 29"', Vendor: 'DT Swiss', 'Option1 Value': '32h', shopify_product_id: 9001, ERD: 595 },
  { Title: 'DT Swiss FR 571 Aluminum 29"', Vendor: 'DT Swiss', 'Option1 Value': '36h', shopify_product_id: 9001, ERD: 595 },
  { Title: 'Reserve 34 SL', Vendor: 'Reserve', 'Option1 Value': '28h', shopify_product_id: 9002, ERD: 590 },
  { Title: 'Reserve 34 SL', Vendor: 'Reserve', 'Option1 Value': '32h', shopify_product_id: 9002, ERD: 590 },
  { Title: 'ERASE V2 ROAD Front Hub', Vendor: 'ERASE Components', 'Option1 Value': '24h' },
  { Title: 'ERASE V2 ROAD Front Hub', Vendor: 'ERASE Components', 'Option1 Value': '28h' },
];

const ids = (rows) => rows.map((r, i) => rowIdOf(r, i));
// the grid marks a cell by "<rowId>|<column>": the number of rows that cell id lights up
const cellsLit = (rows, rowId, col) => rows.filter((r, i) => `${rowIdOf(r, i)}|${col}` === `${rowId}|${col}`).length;

// the edit overlay the grid keeps until Save, then what Save does with it (same steps as handleCommitBatchSave + handleFinalConfirmSave)
function commit(rows, unsaved) {
  const merged = rows.map((r) => (unsaved[r._rid] ? { ...r, ...unsaved[r._rid] } : r));
  return merged.map((item) => { const { _rid, _isNew, _rawIdx, _editIdx, ...rest } = item; return rest; });
}
const search = (rows, text) => rows.filter((r) => `${r.Title} ${r.Vendor}`.toLowerCase().includes(text));

test('cause: rows saved without their own id share the product id, so one click lights several rows', () => {
  const afterOldSave = commit(hydrateRows(FILE), { });
  const lit = ids(afterOldSave);
  assert.equal(new Set(lit).size < lit.length, true, 'rows collide when ids are not given back after a save');
  assert.equal(cellsLit(afterOldSave, lit[0], 'ERD'), 3);
});

test('fresh load: every row has its own id', () => {
  const rows = hydrateRows(FILE);
  assert.equal(new Set(ids(rows)).size, rows.length);
  rows.forEach((r, i) => assert.equal(cellsLit(rows, rowIdOf(r, i), 'ERD'), 1));
});

for (const filter of [null, 'fr 571']) {
  test(`edit, save, select and edit another cell, 3 times in a row (${filter ? 'filter "' + filter + '"' : 'no filter'})`, () => {
    let rows = hydrateRows(FILE);
    for (let round = 0; round < 3; round++) {
      const view = () => (filter ? search(rows, filter) : rows);
      assert.ok(view().length >= 2);
      // select + edit the first visible cell, save
      const a = view()[0];
      rows = hydrateRows(commit(rows, { [a._rid]: { ERD: 600 + round } }));   // the fixed save path: ids are given back
      // every visible row still has its own id, so one click is one cell
      const shown = view();
      assert.equal(new Set(ids(shown)).size, shown.length, 'round ' + round + ': unique ids');
      // select + edit a second cell
      const b = shown[1];
      const bid = rowIdOf(b, 0);
      assert.equal(shown.filter((r) => rowIdOf(r, 0) === bid).length, 1, 'round ' + round + ': one row picked');
      rows = hydrateRows(commit(rows, { [b._rid]: { ERD: 700 + round } }));
      assert.equal(new Set(ids(rows)).size, rows.length);
    }
    // the edits are really there, in the right rows, and nothing else moved
    assert.equal(rows.length, FILE.length);
    assert.deepEqual(rows.slice(0, 3).map((r) => r.ERD), [602, 702, 595]);   // edits landed in the right rows, the third row is untouched
  });
}

test('a save keeps rows that had no product id and gives them separate ids', () => {
  const rows = hydrateRows(commit(hydrateRows(FILE), {}));
  const erase = rows.filter((r) => /ERASE/.test(r.Title));
  assert.equal(new Set(ids(erase)).size, 2);
});
