# Vendored packages

## SheetJS Community Edition 0.20.3 (`xlsx-0.20.3.tgz`)

SheetJS stopped publishing to the npm registry at 0.18.5, which has two high-severity advisories
(GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS). 0.20.3 fixes both and is the newest
release on the vendor's CDN (checked 22 Oct 2026). It is committed here so installs never depend on a CDN (D-24).

| | |
|---|---|
| Source | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, downloaded over HTTPS on 22 Oct 2026 |
| Size | 2,409,319 bytes |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| npm integrity (in `package-lock.json`) | `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` |
| Licence | Apache-2.0 |

`npm audit` does not cover a `file:` dependency, so advisories for SheetJS must be tracked by hand: check
`https://git.sheetjs.com/sheetjs/sheetjs/issues` and the CDN for a newer release at least monthly, and before every
production deployment. To upgrade, download the new tarball from the CDN, record its checksum here, and run
`npm install --save-exact xlsx@file:vendor/<file>`.
