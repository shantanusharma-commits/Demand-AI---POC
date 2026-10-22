import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { NbaScreen } from '@/components/screens/NbaScreen';

// Was legacy/12-nba.html
export const metadata: Metadata = { title: 'Next Best Action — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('12-nba.html');
  return <AppShell page="12-nba.html" user={user} allowed={allowed}>{allowed ? <NbaScreen /> : null}</AppShell>;
}
