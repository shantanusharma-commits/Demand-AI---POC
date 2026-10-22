import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { AnalyticsScreen } from '@/components/screens/AnalyticsScreen';

// Was legacy/13-analytics.html
export const metadata: Metadata = { title: 'Analytics — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('13-analytics.html');
  return <AppShell page="13-analytics.html" user={user} allowed={allowed}>{allowed ? <AnalyticsScreen /> : null}</AppShell>;
}
