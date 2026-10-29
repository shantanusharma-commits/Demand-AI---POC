# Content library test pack

For testing the Content library on the remediation branch, today and after the AI change in section K of the change-request doc. Everything is invented.

| File | What it is |
|---|---|
| `Content_Library_Test_Cases.xlsx` | 25 test cases, each with what to expect TODAY and AFTER the AI change, plus the expected rules, the claims, the messaging plays and frameworks to add, and the words to type |
| `guidelines/A_structured_guideline.*` (.md, .txt, .docx, .pdf, .pptx) | The guideline with one rule per line, the way today's rules parser reads them |
| `guidelines/B_narrative_guideline.*` (.txt, .docx, .pdf) | The same guideline written in prose, the way a marketing team writes it |

Both styles hold 16 rules, four lines of writing guidance, a messaging play for each of the six segments and four messaging frameworks.

What the branch's own parser (`readRules` in `lib/content/brand.ts`) suggests today: all 16 rules from the structured .md and .txt, none from the narrative .txt, and nothing from Word, PDF or PowerPoint (they are stored for reference only). After the change, the AI should suggest all 16 from every file, and read the guidance, plays and frameworks into their tabs.

## Rebuilding

```bash
python3 scripts/make_content_pack.py .                                   # the guideline files
node scripts/read_rules.mjs scripts/texts.json scripts/rules_today.json  # today's parser on the .md and .txt
python3 scripts/make_content_pack.py . scripts/rules_today.json          # the workbook
```

Needs `python-docx`, `python-pptx`, `openpyxl` and LibreOffice Writer (for the PDFs).
