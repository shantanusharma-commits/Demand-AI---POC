import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { ScoringScreen } from '@/components/screens/ScoringScreen';

// Was legacy/11-scoring.html
export const metadata: Metadata = { title: 'Account Scoring — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('11-scoring.html');
  return <AppShell page="11-scoring.html" user={user} allowed={allowed}>{allowed ? <ScoringScreen /> : null}</AppShell>;
}
