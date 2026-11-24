# Hub-choice tool data (the four hub-choice masters)

- `hub_choice_catalogue.json`: Agent C's catalogue (product and variant ids only; the tool reads prices, colours, stock and hub numbers live). Updated 2026-11-24 for the Project321 6-Bolt switch: front 15472281977139 (15x110mm and 20x110mm (Boost)), rear 15472230334771 (12x148mm (Boost) and 12x157mm (SuperBoost)), 10 colours. The retired 6-Lock products are listed in `lib/signature-build/hub/constants.js` (`RETIRED_HUB_PRODUCTS`): a setup or catalogue that names one is blocked.
- `setup_*.json`: the four setups generated from the catalogue (`configsFromCatalogue`), one per master.
- `hub_choice_spoke_lengths.csv`: Backend 1's spoke length table the dry run reads (Project321 rows point at the 6-Bolt hub variants).
