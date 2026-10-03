# Lead discovery test dataset

`Lead_Research_Sample_Dataset.xlsx` is the lead research template filled with 7,498 contact rows at 1,400 fictional accounts, plus a 1,492-row signal file. Use it to test Lead discovery and research (features 3.1 to 3.6) at realistic volume. Every company, person, domain and sales rep is invented. The client is called "Client", and reps use `client-sample.com`.

| Sheet | What it is | Read by the platform? |
|---|---|---|
| How to fill this in, Field guide, Example rows | The template's guidance sheets, unchanged apart from anonymising the client's name | No |
| Lead template | 7,498 contact rows (row 4 onwards). Upload this in Prospecting | Yes |
| Dataset summary | Totals for the dataset | No |
| Signal template | 1,492 signal rows, scoring date 2026-09-30. Upload this in Scoring | Yes |
| Account key | One row per true account: region, real vertical, expected status, knock-outs and the test cases on it | No (answer key) |
| Row key | Every lead and signal row that carries a test case, with the expected result | No (answer key) |
| Test scenarios | 86 test cases with the PDF step (3.1 to 3.6), the data-quality code, the expected behaviour and a count | No (answer key) |

## What is in it

- **Missing fields:** every required field is blank somewhere. That includes a blank company name (the row isn't loaded), rows with no email and no LinkedIn URL, accounts with no revenue or employee count, and Indonesian contacts known by a single name.
- **Duplicates:** exact repeats, the same email in different case, the same LinkedIn profile with a different URL form, the same person re-exported with a new title, near-duplicates that use a different email alias, the same person listed at two companies, and one company written two ways.
- **Invalid emails:** addresses that break the syntax rules (no @, two @, no TLD, spaces, placeholders such as "n/a"). Also addresses that look valid but shouldn't be used: double dots, a trailing dot, a `mailto:` prefix, personal webmail, role mailboxes such as `info@`, a domain that doesn't match the company, and domain typos such as `.con`.
- **Out-of-ICP records:** accounts outside the pilot region, accounts managed separately, industries outside the vertical, distributors, small companies, the pilot product already installed (a signal), and accounts where every contact has opted out.
- **Formatting:** Yes/No/TRUE in place of Y/N, numbers written as `$2,400,000,000` or `2.4B`, domains given as full URLs, LinkedIn links that aren't profiles, account types not on the list, consent bases that aren't recognised, countries written as `SG` or `Viet Nam`, company details that differ between rows of one company, abbreviated or local-language job titles, and names with diacritics or garbled encoding.
- **Signals:** qualified signals, auto-assigned signals, installed-base knock-outs, newsletter sign-ups (D1), stale signals (D2), bad, blank or future dates and unknown types (D3), unknown companies and people (D4), and repeated signals (D5).

## Regenerating

The data is generated from a fixed seed, so running the script again gives the same file.

```
python3 test-data/generate_lead_dataset.py <Lead_Research_Template.xlsx> test-data/Lead_Research_Sample_Dataset.xlsx
```

It needs `openpyxl`. The first argument is the empty template workbook, which isn't stored in the repo.
