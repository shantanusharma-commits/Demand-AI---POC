/* Data for the Micro-segments & NBA screen — carried over verbatim from legacy/12-nba.html. */

export interface RunnerUp { action: string; reason: string; chosenReason: string }
export interface MeetingPrep { opener: string; questions: string[]; objection: string; ask: string }

/** One queued account. Same shape as the original NBA_QUEUE entries and the items Scoring writes to demandai_nba_v1. */
export interface NbaItem {
  id: string; name: string; title?: string; co: string; priority?: number;
  action: string; chosenAction: string; channel: string; channelWhy: string;
  routed: string; confidence: string; team?: string | null;
  signal: string; signalSrc: string; format?: string;
  runnerUp?: RunnerUp | null;
  emailSubj?: string; email?: string; dmNote?: string; dmMessage?: string; callOpener?: string;
  meetingBooked?: boolean; sentDaysAgo?: number; outcome?: string; outcomeReportedBy?: string;
  meetingPrep?: MeetingPrep | null;
  isNew?: boolean; caughtByWatch?: boolean; selfCorrected?: boolean; existingCustomer?: boolean;
  originatedFrom?: string; fromScoring?: boolean; wasEdited?: boolean;
}

export const NBA_QUEUE: NbaItem[] = [
  {id:'l8', name:'Daniel Voss', title:'VP Operations', co:'Continental Polymer Works', priority:93, action:'Modernisation', chosenAction:'Propose a migration or upgrade discussion', channel:'Email', channelWhy:'Verified, sendable email — no warm-path or LinkedIn needed to pick the channel.', routed:'auto', confidence:'high', team:'NA Chemicals — Enterprise',
   signal:'Their SAP contract renews in 41 days, and a competitor\u2019s usage numbers on the incumbent system are already trending down.', signalSrc:'HG Insights Contracts', format:'email',
   runnerUp:{action:'Offer a site assessment', reason:'Also fits the renewal signal, but the migration case study is a stronger match to a usage-decline pattern specifically.', chosenReason:'Strongest match to a renewal-window trigger with a usage-decline signal on the incumbent.'},
   emailSubj:'Congrats on the expansion — a question about your renewal timeline',
   email:`Hi Daniel,\n\nSaw Continental Polymer's capacity expansion announcement — congratulations on the growth.\n\nSeparately, I noticed your current process control contract is up for renewal in the next couple of months. A few of our chemicals-sector customers have used a renewal cycle like this to pressure-test whether their existing DCS setup still fits a larger footprint.\n\nWorth a 20-minute conversation before that renewal date locks you in for another term?\n\nBest,\nClient Team`,
   meetingBooked:true, sentDaysAgo:5, outcome:'meeting-booked', outcomeReportedBy:'Pavan Kumar',
   meetingPrep:{opener:'Thanks for making time, Daniel — I know the renewal window is tight, so I\u2019ll keep this focused.',
     questions:['What\u2019s actually driving the capacity expansion — new lines, new sites, or both?','Where has the current DCS setup felt like it\u2019s straining as you\u2019ve scaled?','Who else needs to be in the room before a renewal decision locks in?'],
     objection:'"We just don\u2019t have bandwidth to evaluate anything before the renewal date." \u2192 A comparison doesn\u2019t require switching — it just means the renewal isn\u2019t a blind commitment. We can scope the comparison to fit whatever time you actually have.',
     ask:'Propose a technical session with their automation team within two weeks, before the renewal date locks in.'}},
  {id:'l4', name:'Mark Delacroix', title:'Plant Manager', co:'Cascade Power Systems', priority:41, action:'Modernisation', chosenAction:'Follow up on an inquiry or RFQ', channel:'Call', channelWhy:'No verified email, no LinkedIn URL — phone number on file is the only viable channel.', routed:'review', confidence:'low', team:null,
   signal:'Hiring surge — 3 process engineering roles posted in the last two weeks, often a precursor to a capacity or modernisation project.', signalSrc:'PredictLeads', format:'call',
   callOpener:`"Hi Mark, this is [name] from Client — I saw Cascade's been hiring process engineers and wanted to ask, is that tied to a capacity project? I'll keep this to two minutes."`,
   runnerUp:{action:'Invite to a product demo', reason:'Reasonable given the hiring signal alone, but a cold call fits a phone-only contact better than an email-based demo invite.', chosenReason:'Only viable channel (no email or LinkedIn), so the action had to be one deliverable by call.'}},
  {id:'l1', name:'Karen Whitfield', title:'VP Operations', co:'Meridian Chemical Corp', priority:88, action:'Project', chosenAction:'Share a relevant case study or reference project', channel:'Email', channelWhy:'Verified, sendable email — default for a Project-segment first touch.', routed:'auto', confidence:'high', team:'NA Chemicals — Enterprise', isNew:true, sentDaysAgo:3,
   signal:'Their team has been actively comparing process control platforms this month, and their current contract renews in 34 days.', signalSrc:'G2 Buyer Intent', format:'email',
   emailSubj:'Noticed your team evaluating process control options',
   email:`Hi Karen,\n\nYour team's research activity around process control platforms caught our attention this week.\n\nIf you're early in that evaluation, happy to share how a few similarly-sized chemicals operators approached the same decision.\n\nOpen to a short call this week or next?\n\nBest,\nClient Team`},
  {id:'l12', name:'Robert Achebe', title:'Chief Operating Officer', co:'Trident Refining', priority:84, action:'Leadership', chosenAction:'Introduction to a new leader in a buying role', channel:'DM', channelWhy:'Warm-path exists (a colleague worked with him previously) — DM first, per the Leadership segment\u2019s default, then email.', routed:'auto', confidence:'high', team:'EMEA Oil & Gas — Enterprise', caughtByWatch:true, sentDaysAgo:9,
   signal:'Robert just moved into this role from an account you\u2019ve already closed — he\u2019s used your platform before and knows what it does.', signalSrc:'LinkedIn job-change alerts', format:'video',
   emailSubj:'Congratulations on the move to Trident, Robert',
   email:`Hi Robert,\n\nCongratulations on stepping into the COO role at Trident Refining.\n\nWe worked together a few years back when you were leading operations at Vantage Process Group. Given you're settling into a new environment, happy to share what a similar transition looked like for a peer of yours.\n\nBest,\nClient Team`,
   dmNote:'Congratulations on the move to Trident \u2014 we worked together a while back at Vantage Process Group.',
   dmMessage:`Hi Robert, congratulations again on the COO role. Given you're settling in, happy to share what a similar platform transition looked like for a peer of yours at another refinery \u2014 no pressure, just useful context.`},
  {id:'l7', name:'Rebecca Lindqvist', title:'Director of Automation', co:'Ridgeline Utilities', priority:58, action:'Regulation', chosenAction:'Invite to a webinar or event', channel:'Email', channelWhy:'Regulation segment defaults to email — compliance content reads better as a document, not a DM.', routed:'review', confidence:'medium', team:null,
   signal:'Their grid-reliability audit window opens in 70 days — worth getting ahead of before it becomes urgent.', signalSrc:'Public regulatory calendars', format:'onepager',
   emailSubj:'A compliance date worth getting ahead of',
   email:`Hi Rebecca,\n\nRidgeline's grid-reliability audit window opens in about ten weeks. I've put together a short one-pager laying out the actual dates and what typically needs to be true by each of them.\n\nBest,\nClient Team`},
  {id:'l3', name:'Priya Ramaswamy', title:'Chief Digital Officer', co:'Ferro Dynamics Ltd', priority:53, action:'Project', chosenAction:'Consideration message on the use case', channel:'DM', channelWhy:'No verified email on file, but a LinkedIn URL exists — LinkedIn-only case, so DM.', routed:'review', confidence:'low', team:null,
   signal:'Ferro Dynamics closed a Series C three weeks ago — funding rounds like this often kick off a fresh evaluation of the operational stack.', signalSrc:'Crunchbase', format:'email',
   emailSubj:'Congratulations on the Series C',
   email:`Hi Priya,\n\nCongratulations on the Series C. Growth rounds like this often trigger a rethink of the digital backbone underneath manufacturing operations.\n\nBest,\nClient Team`,
   dmNote:'Congratulations on the Series C for Ferro Dynamics \u2014 exciting stage.',
   dmMessage:`Hi Priya, congratulations again on the raise. Growth rounds like this often trigger a rethink of the digital backbone underneath manufacturing ops \u2014 happy to share how a couple of similarly-staged operators approached sequencing that.`},
  {id:'l6', name:'Thomas Okafor', title:'Head of Process Safety', co:'Altair Petrochemicals', priority:49, action:'Modernisation', chosenAction:'Offer a site assessment or health check', channel:'Email', channelWhy:'Verified, sendable email.', routed:'review', confidence:'medium', team:null, selfCorrected:true,
   signal:'Their incumbent DCS platform is showing a usage-decline pattern — often an early sign of reliability issues before they hit the plant floor.', signalSrc:'HG Insights AI Maturity', format:'email',
   emailSubj:'A pattern we\u2019re seeing on your incumbent platform',
   email:`Hi Thomas,\n\nWe're seeing a usage-decline pattern on the DCS platform Altair currently runs. Given your process-safety mandate, that's usually worth a proactive look.\n\nBest,\nClient Team`},
  {id:'l5', name:'Isabelle Perrot', title:'VP Manufacturing', co:'Solvex Industrial', priority:66, action:'Modernisation', chosenAction:'Offer a site assessment or health check', channel:'Email', channelWhy:'Verified, sendable email.', routed:'review', confidence:'medium',
   signal:'Their contract with a competitor renews in 58 days — a real window to make the case.', signalSrc:'HG Insights Contracts', format:'email',
   emailSubj:'A cost question ahead of your renewal window',
   email:`Hi Isabelle,\n\nYour current contract looks to be up for renewal in the next couple of months. Worth a quick look at where operating cost typically shows up beyond the licence line.\n\nBest,\nClient Team`},
  {id:'exp1', name:'Lena Fischer', title:'VP Digital', co:'NorthGate Energy Solutions', priority:71, action:'Modernisation', chosenAction:'Cross-sell to an existing customer site', channel:'Email', channelWhy:'Verified, sendable email — existing account, own install-base lifecycle trigger.', routed:'review', confidence:'medium', team:null, existingCustomer:true, isNew:true,
   signal:'Usage data shows they\u2019re nearing capacity on their current module — a cross-sell opportunity on an existing account, not a renewal risk.', signalSrc:'Internal CRM — usage data', format:'email',
   emailSubj:'A capacity question on your current deployment',
   email:`Hi Lena,\n\nYour usage data has been climbing steadily — approaching the ceiling on what your current module handles.\n\nBest,\nClient Team`},
  {id:'in1', name:'Marcus Webb', title:'Head of IT', co:'Solenne Manufacturing', priority:44, action:'Engagement', chosenAction:'Follow up on an inquiry or RFQ', channel:'Email', channelWhy:'Verified, sendable email — Phase 3 segment, used early since Teams-inbound capture already exists.', routed:'review', confidence:'low', team:null, originatedFrom:'teams', isNew:true,
   signal:'They asked a question about DCS integration timelines in your Teams channel — captured automatically, not sourced outbound.', signalSrc:'Microsoft Teams — inbound capture', format:'email',
   emailSubj:'Following up on your integration-timeline question',
   email:`Hi Marcus,\n\nFollowing up on your question about DCS integration timelines. For a deployment your size, a typical integration runs 8–12 weeks end to end.\n\nBest,\nClient Team`},
];
export const NEW_SEGMENTS = ['Engagement'];
export const ROUTE_LBL: Record<string, string> = {auto:'AUTO-ROUTED',review:'NEEDS REVIEW',onhold:'ON HOLD'};
export const ROUTE_CLS: Record<string, string> = {auto:'sc-h',review:'sc-m',onhold:'delta-flat'};
export const CONF_LBL: Record<string, string> = {high:'High confidence',medium:'Medium confidence',low:'Low confidence'};
export const CONF_CLS: Record<string, string> = {high:'sc-h',medium:'sc-m',low:'sc-l'};

export const OUTCOME_OPTIONS: { v: string; label: string }[] = [
  {v:'no-response', label:'No response yet'},
  {v:'replied', label:'Replied — no meeting yet'},
  {v:'meeting-booked', label:'Meeting booked'},
  {v:'not-interested', label:'Not interested'},
];
