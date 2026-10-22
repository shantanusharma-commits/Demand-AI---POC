import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { TodayScreen } from '@/components/screens/TodayScreen';

// Was legacy/00-today.html
export const metadata: Metadata = { title: 'Today — DemandAI Pilot' };

export default async function Page() {
  const { user, allowed } = await requirePage('00-today.html');
  return <AppShell page="00-today.html" user={user} allowed={allowed}>{allowed ? <TodayScreen /> : null}</AppShell>;
}
