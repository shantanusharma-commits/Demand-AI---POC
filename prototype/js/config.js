/* Demand AI prototype: configuration.
   Every proposed default from the brief lives here, so changing a value changes the result.
   The Admin screen edits a copy of this at run time (stored in this browser only). */
(function (root) {
  const DM_CONFIG = {
    DEMO_ANONYMISE: true,
    /* The clock the demo runs on. "Advance time" moves it forward. */
    baseNow: '2026-11-18T06:00:00',
    versions: { rules: 'rules 2026.11.1', tiers: 'tier table 2026.11.1', prompts: 'prompts 2026.11.1', thresholds: 'thresholds 2026.11.1' },

    /* Signal tiers: points, days at full weight, day the weight reaches zero (linear in between). */
    signalTiers: {
      1: { points: 100, fullDays: 3, zeroDays: 14 },
      2: { points: 60, fullDays: 14, zeroDays: 60 },
      3: { points: 30, fullDays: 60, zeroDays: 90 }
    },
    /* Strength 1 to 5 maps to 0.6 to 1.0; 3 is the default when the model could not score it. */
    strengthFactor: { 1: 0.6, 2: 0.7, 3: 0.8, 4: 0.9, 5: 1.0 },
    defaultStrength: 3,

    /* Entry gate: a repeat of the same signal type for the same account within the window counts less.
       First 1.0, second 0.5, third 0.25, fourth 0.15 (assumption: the brief leaves it open), fifth onward 0.1. */
    repeatWindowDays: 30,
    repeatFactors: [1, 0.5, 0.25, 0.15, 0.1],

    /* Account tiers by percentile of rank among accounts with rank above 0. */
    accountTiers: { A: 0.15, B: 0.25 },

    /* Confidence: four factors combined into 0 to 1, then banded. */
    confidence: {
      high: 0.75, medium: 0.5,
      weights: { identity: 0.4, sources: 0.2, strength: 0.2, evidence: 0.2 },
      identityScore: { I1: 1, I2: 0.85, I3: 0.55, I4: 0.2, I5: 0.4 }
    },

    /* NBA or NBC: 10 or more accounts in one microsegment within a rolling 7 days raise a campaign flag. */
    campaign: {
      threshold: 10, windowDays: 7,
      touches: [
        { n: 1, day: 0, channel: 'Email', kind: 'Plain text referencing the shared trigger' },
        { n: 2, day: 4, channel: 'LinkedIn', kind: 'Reinforces the angle and cites an asset or statistic from the Knowledge Hub' },
        { n: 3, day: 8, channel: 'Email', kind: 'A direct ask referencing both' }
      ]
    },

    escalationDueDays: 3,
    recentTouchDays: 14,
    heldRecordCycles: 3,
    nicheConfidenceMin: 0.6,

    /* Backtest pass bars. */
    backtest: { wonMinAB: 12, lostMaxAB: 3, randomMaxShareTierA: 0.4, stopBelowWon: 9 },

    /* Drafts are pre-written in the seed. An API key here would switch to a language model (not used in the demo). */
    llm: { enabled: false, apiKey: '' },

    /* Cost caps for model and data calls, per month. */
    costCap: { monthly: 400, currency: 'GBP', alertAt: 0.8 },

    roles: {
      rep: { label: 'Sales rep', user: 'sofia' },
      manager: { label: 'Sales manager', user: 'daniel' },
      leader: { label: 'Sales leader', user: 'helen' },
      admin: { label: 'Admin (RevOps)', user: 'rajiv' }
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DM_CONFIG;
  else root.DM_CONFIG = DM_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
