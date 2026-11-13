// Made-up order lists (fake order numbers, no customer fields) in the shape of Backend 1's sheet.orderList (spoke-automation PR #11).
const ent = (color, n, spare = 0, extra = {}) => ({ color, n, spare, qty: n + spare, ...extra });
const side = (position, s, lengthMm, entries, baseColor = 'Black') => ({ position, side: s, lengthMm, baseColor, baseColorNote: 'base color: ' + baseColor, entries });

const CART = 'https://b2b.industrynine.com/cart/43663812755591:9,43663812821127:8,43663819047047:9,43663819112583:8';
const ADDS = '9 x 282 mm Black, 8 x 282 mm Bronze, 9 x 284 mm Black, 8 x 284 mm Bronze (total 34 spokes, includes 2 spares)';
const MAIL = 'Hi Thomas, for LoamLabs order #12345 please add System spokes: 305 mm: 8 Black, 7 Bronze; 307 mm: 8 Black, 7 Bronze. Thank you.';
const TEXT = "I9 ORDER LIST  -  order #12345\n\nA. PRE-BUILT WHEELS\n   none for this order (both wheels are two-color)\n\nB. SPOKES on I9's dealer list, with spares   [Open I9 cart link]\n   Rear   rotor  284 mm  Black 8 +1 spare = 9   Bronze 8  (base color: Black)\n   Rear   drive  282 mm  Black 8 +1 spare = 9   Bronze 8  (base color: Black)\n   THE LINK ADDS:  " + ADDS + "\n   Cart link (plain): " + CART + "\n   Check the cart against this list before paying. Variant ids from the 2026-11-08 B2B file.\n\nC. SPOKES NOT on the dealer list: ORDER BY EMAIL OR PHONE (Thomas Ward)\n   Front  rotor  305 mm  Black 7 +1 spare = 8   Bronze 7  (base color: Black)\n   Front  drive  307 mm  Black 7 +1 spare = 8   Bronze 7  (base color: Black)\n   Text: \"" + MAIL + "\"\n\nD. HUBS (from I9)\n   Front: Industry Nine Hydra2 SYSTEM Front Hub - 6-Bolt (28h / Bronze / 15x110mm)\n   Rear: Industry Nine Hydra2 SYSTEM Rear Hub - 6-Bolt (32h / Bronze / 12x148mm), driver XD\n\nE. RIMS (from I9)\n   Front: We Are One TRIAD Carbon Rim (Enduro) - 29\", 28h  (I9 code TR303)\n   Rear: We Are One TRIAD Carbon Rim (Enduro) - 27.5\", 32h  (I9 code TR305)\n";

function twoWheelList() {
  return {
    version: 1, orderNumber: '12345', snapshotDate: '2026-11-08', text: TEXT, cartLink: CART, cartLinkAdds: ADDS, orderByEmailText: MAIL,
    sections: {
      prebuilt: { lines: ['A. PRE-BUILT WHEELS', '   none for this order (both wheels are two-color)'], none: true, wheels: [] },
      dealerSpokes: {
        lines: ["B. SPOKES on I9's dealer list, with spares   [Open I9 cart link]", '   Rear   rotor  284 mm  Black 8 +1 spare = 9   Bronze 8  (base color: Black)', '   THE LINK ADDS:  ' + ADDS, '   Cart link (plain): ' + CART, '   Check the cart against this list before paying. Variant ids from the 2026-11-08 B2B file.'],
        sides: [side('rear', 'rotor', 284, [ent('Black', 8, 1, { outOfStock: false }), ent('Bronze', 8, 0, { outOfStock: false })]), side('rear', 'drive', 282, [ent('Black', 8, 1, { outOfStock: false }), ent('Bronze', 8, 0, { outOfStock: false })])],
        noLength: [],
        cartLink: { url: CART, adds: ADDS, totals: { spokes: 34, spares: 2 }, items: [{ variantId: 43663812755591, qty: 9, spares: 1, lengthMm: 282, color: 'Black', available: true }, { variantId: 43663812821127, qty: 8, spares: 0, lengthMm: 282, color: 'Bronze', available: true }, { variantId: 43663819047047, qty: 9, spares: 1, lengthMm: 284, color: 'Black', available: true }, { variantId: 43663819112583, qty: 8, spares: 0, lengthMm: 284, color: 'Bronze', available: true }] },
      },
      orderByEmail: {
        lines: ['C. SPOKES NOT on the dealer list: ORDER BY EMAIL OR PHONE (Thomas Ward)'], to: 'Thomas Ward', message: MAIL,
        sides: [side('front', 'rotor', 305, [ent('Black', 7, 1, { reason: 'length', reasonText: null }), ent('Bronze', 7, 0, { reason: 'length', reasonText: null })]), side('front', 'drive', 307, [ent('Black', 7, 1, { reason: 'length', reasonText: null }), ent('Bronze', 7, 0, { reason: 'length', reasonText: null })])],
      },
      hubs: { lines: ['D. HUBS (from I9)'], wheels: [{ position: 'front', text: 'Industry Nine Hydra2 SYSTEM Front Hub - 6-Bolt (28h / Bronze / 15x110mm)', customerSupplied: false }, { position: 'rear', text: 'Industry Nine Hydra2 SYSTEM Rear Hub - 6-Bolt (32h / Bronze / 12x148mm), driver XD', customerSupplied: false }] },
      rims: { lines: ['E. RIMS (from I9)'], wheels: [{ position: 'front', text: 'We Are One TRIAD Carbon Rim (Enduro) - 29", 28h', customerSupplied: false, i9Code: 'TR303' }, { position: 'rear', text: 'We Are One TRIAD Carbon Rim (Enduro) - 27.5", 32h', customerSupplied: false, i9Code: 'TR305' }] },
    },
  };
}

// one wheel only (a rear-only order), every length on the dealer list, one entry out of stock
function oneWheelList() {
  const l = twoWheelList(); const S = l.sections;
  S.dealerSpokes.sides = [S.dealerSpokes.sides[0]]; S.dealerSpokes.sides[0].entries[1].outOfStock = true; S.dealerSpokes.cartLink.items[3].available = false;
  S.orderByEmail = { lines: [], to: 'Thomas Ward', message: '', sides: [] }; l.orderByEmailText = null;
  S.hubs.wheels = [S.hubs.wheels[1]]; S.rims.wheels = [S.rims.wheels[1]];
  return l;
}

// a pre-built wheel: one wheel is single color, so I9 builds it
function prebuiltList() {
  const l = twoWheelList(); const S = l.sections;
  S.prebuilt = { lines: ['A. PRE-BUILT WHEELS', '   Front: one color (Black) - check I9 for a pre-built wheelset'], none: false, wheels: [{ position: 'front', color: 'Black' }] };
  S.orderByEmail = { lines: ['C. SPOKES NOT on the dealer list: ORDER BY EMAIL OR PHONE (Thomas Ward)'], to: 'Thomas Ward', message: MAIL, sides: [side('rear', 'rotor', 291, [ent('Black', 8, 1, { reason: 'color', reasonText: 'color not on the dealer list' })])] };
  return l;
}

const sheetBase = (kind) => ({ sheetVersion: 2, kind, studio: true, orderNumber: '12345', orderName: '#12345', orderCreatedAt: '2026-11-12T19:11:21Z', orderCancelled: false, buildId: '999001', calculation: { mode: 'recalculated', at: '2026-11-13T09:30:00Z', text: 'recalculated on 2026-11-13, may differ from what was sent' }, numbering: { label: 'numbering version 1', rule: 'provisional' }, wheels: [], warnings: [], orderChecks: [] });

const systemSheet = (extra = {}) => ({ ...sheetBase('system'), orderListStatus: 'present', orderListNote: null, orderList: twoWheelList(), ...extra });
const standardSheet = () => ({ ...sheetBase('standard'), orderListStatus: 'not-applicable', orderListNote: 'Standard builds have no I9 order list.', orderList: null });
const errorSheet = () => ({ ...sheetBase('system'), orderListStatus: 'error', orderListNote: 'The I9 dealer list could not be read.', orderList: null });
const notSavedSheet = () => { const s = sheetBase('system'); s.sheetVersion = 1; s.calculation = { mode: 'saved', at: '2026-11-10T12:00:00Z', text: 'as sent' }; return s; };

module.exports = { CART, ADDS, MAIL, TEXT, twoWheelList, oneWheelList, prebuiltList, systemSheet, standardSheet, errorSheet, notSavedSheet };
