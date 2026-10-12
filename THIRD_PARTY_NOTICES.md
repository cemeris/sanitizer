# Third-Party Notices

This project includes third-party software distributed under its own license terms.

## mammoth.js

- Project: https://github.com/mwilliamson/mammoth.js
- Copyright: Copyright (c) 2013, Michael Williamson
- License: BSD-2-Clause
- Local file used: `vendor/mammoth.browser.min.js`
- License text: `third_party_licenses/MAMMOTH-LICENSE.txt`

Redistributions of this project retain the original copyright notice,
license conditions, and disclaimer for mammoth.js via the included license file.

## docx

- Project: https://github.com/dolanmiu/docx
- Copyright: Copyright (c) 2016 Dolan
- License: MIT
- Local file used: `vendor/docx.iife.js`
- License text: `third_party_licenses/DOCX-LICENSE.txt`

## Excel import/export

Modern `.xlsx` import/export uses browser-native `DecompressionStream`, `DOMParser`, `TextEncoder`, and ZIP/XML serialization implemented in `app.js`. No third-party Excel runtime or network service is used. Legacy binary `.xls` files are intentionally unsupported.
