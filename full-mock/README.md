# Demand AI: full product mock

The complete Demand AI product as a clickable mock. It uses the same screens, look and story as the production mock in `../production-mock`, with every capability switched on. Every company and person is invented. Nothing is sent.

Open `index.html` and sign in as Sofia (rep), Daniel (manager) or Rajiv (admin). The rep and the manager see different screens; admin has six: Home, Connections, ICP and scoring, Rules, Content library, Users and audit.

## What it covers

| Capability | Where |
|---|---|
| ICP and cold start (shared ICP, or proposed from the website and an interview) | Admin › ICP and cold start |
| Signals at five levels: market, company, competitor, personal, first-party; the fast lane | Accounts › Signals |
| Score = Fit × Timing ÷ 100, tiers A/B/C, identity tiers I1–I5 | Account page › Overview and Details |
| Buying committee, motivation, warm paths, rival research | Account page › Overview |
| Context graph | Account page › Context graph |
| Five criteria; assisted send, autopilot by segment, approval cards | Approvals; Admin › Policy |
| Escalations with owner, due time and default (including status watch, anomaly alerts, meeting confirmation, the weekly learning review and source scoring) | Approvals › Also needs you |
| Next best campaigns with assets per touch, confirmed by the manager, sent through the team's tools with coordination and send windows | Campaigns |
| Every content format, grounded and cited | Campaigns › Content, or ask in chat ("Make a deck on …") |
| Six reply statuses with default actions | Inbox |
| Morning workflows: who replied, who looked, campaigns, account history, meeting prep, demo follow-up, quota | Ask in chat; suggestions on Today |
| Analytics and scorecards | Analytics (manager and leader) |
| Learning loop: pattern cache, source scoring, coverage gaps, anomalies, objection learning | Admin › Learning |
| Interfaces: chat, Slack, Teams, command line, MCP server and clients, API and Power BI | Admin › Interfaces |
| Fail closed, demo clock, backtest | Admin › Simulate and Backtest |

Build a publishable copy with `python3 full-mock/tools/build-artifact.py <out-dir>`.
