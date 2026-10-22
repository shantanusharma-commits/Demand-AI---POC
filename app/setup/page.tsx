import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { SetupScreen } from '@/components/screens/SetupScreen';

// Was legacy/09-setup.html
export const metadata: Metadata = { title: 'Setup — DemandAI Pilot' };

export default async function Page() {
  const { user, allowed } = await requirePage('09-setup.html');
  return <AppShell page="09-setup.html" user={user} allowed={allowed}>{allowed ? <SetupScreen /> : null}</AppShell>;
}
