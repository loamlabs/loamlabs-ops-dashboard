// lib/signature-build/hub/constants.js
// Constants for hub-choice Signature Builds (HUB_CHOICE_DECISIONS_AND_CONTRACT.md). Plain data, no I/O.

// Decision 2: exactly two Shopify options. 12x150 is NOT offered.
const OPTION_SPACING = 'Axle spacing';
const OPTION_HUB = 'Hub model';
const SPACINGS = [
    { key: 'A', front: '15x110', rear: '12x148' },
    { key: 'B', front: '15x110', rear: '12x157' },
    { key: 'C', front: '20x110', rear: '12x157' },
];
const spacingValue = (s) => `${s.front}mm / ${s.rear}mm`;   // the Shopify option value, e.g. "15x110mm / 12x148mm"
const spacingName = (s) => `${s.front}/${s.rear}`;           // used in rule names and the variant recipe, e.g. "15x110/12x148"

// The builder's own Step 2 labels (contract resolution 1). A rule and a variant recipe carry the label the STORE gives the hub variants
// (custom.wheel_spec_hub_spacing), which must be one of these, because the builder's match compares the exact text.
const BUILDER_SPACING_LABELS = {
    front: ['15x110mm', '20x110mm (Boost)', '20x110mm (Non-Boost)', '15x100mm'],
    rear: ['12x148mm (Boost)', '12x157mm (SuperBoost)', '12x157mm (DH)', '12x150mm', '12x142mm'],
};

// Decision 5: rotor mount is 6-Bolt only.
const BRAKE_STYLE = '6-Bolt';

// Signature rule 1: bladed spokes are the only ones allowed to be straight pull on a mountain build. Bladed or round is NOT stored in the
// catalogue, so it comes from the model name (CX-Ray, D-Light and CX-Sprint are bladed; Race, Laser and Berd PolyLight are round).
const BLADED_SPOKES = /cx-?ray|d-?light|cx-?sprint/i;

// Assembly fee per wheel, copied from the builder's own tables (theme assets/variant-builder.js, HUB_VENDOR_TO_ASSEMBLY_VARIANT_GID_MAP and
// RIM_VENDOR_TO_ASSEMBLY_VARIANT_GID_MAP, about lines 241 to 262, Release 14 preview). Rule in the builder (about line 4450): hub rate and rim rate, the
// HIGHER wins when both exist; only one exists: that one; neither: the default $60. e*thirteen and Project321 are NOT in the hub table, and
// "DT Swiss" is NOT in the rim table, so those fall through to the rim rate or the default. A copy of constants: keep in sync with the theme.
const ASSEMBLY = {
    hub: { 'chris king': 80, 'erase components': 80, hope: 70, 'industry nine': 40, oneup: 80, 'onyx racing': 80, spank: 70, tairin: 70, tune: 80, 'your own component': 120 },
    rim: { nobl: 80, reserve: 50, 'we are one': 40, 'your own component': 120 },
    default: 60,
    source: 'theme assets/variant-builder.js (Release 14 preview) lines 241-262 and 4450-4475',
};

// The master price takes 10% off everything in the builder total (LOAMLABS10). Verified against master 4 ($2,403.00 list, $2,162.70).
const DISCOUNT = 0.1;

// Contract example: "SRAM XD", "Shimano HG", "Shimano MicroSpline". Keys are the option names the freehub list uses on the hub products.
// Contract resolution 2: ONLY these three are offered in the page picker on hub-choice products (XD-R, HG-R and N3W are not: those customers use Customize).
const FREEHUB_LABELS = { XD: 'SRAM XD', HG: 'Shimano HG', MS: 'Shimano MicroSpline' };

const PRODUCT_TYPE = 'LoamLabs Preconfigured Wheelset';
const TITLE_SUFFIX = 'Wheelset | Custom-built MTB/Gravel Wheels';

module.exports = { BUILDER_SPACING_LABELS, OPTION_SPACING, OPTION_HUB, SPACINGS, spacingValue, spacingName, BRAKE_STYLE, BLADED_SPOKES, ASSEMBLY, DISCOUNT, FREEHUB_LABELS, PRODUCT_TYPE, TITLE_SUFFIX };
