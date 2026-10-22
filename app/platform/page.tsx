import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { PlatformScreen } from '@/components/screens/PlatformScreen';
import { requirePage } from '@/lib/server/auth/page';

export const metadata: Metadata = { title: 'Business units — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('platform');
  return <AppShell page="platform" user={user} allowed={allowed}>{allowed ? <PlatformScreen /> : null}</AppShell>;
}
