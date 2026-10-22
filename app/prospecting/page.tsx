import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { ProspectingScreen } from '@/components/screens/ProspectingScreen';

// Was legacy/10-prospecting.html
export const metadata: Metadata = { title: 'Prospecting — DemandAI Pilot' };

export default async function Page() {
  const { user, allowed } = await requirePage('10-prospecting.html');
  return <AppShell page="10-prospecting.html" user={user} allowed={allowed}>{allowed ? <ProspectingScreen /> : null}</AppShell>;
}
