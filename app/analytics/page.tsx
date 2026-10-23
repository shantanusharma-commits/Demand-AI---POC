import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { AnalyticsScreen } from '@/components/screens/AnalyticsScreen';

// Was legacy/13-analytics.html. ?tab= opens a tab (Today's links use it).
export const metadata: Metadata = { title: 'Analytics — DemandAI' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, allowed } = await requirePage('13-analytics.html');
  const { tab } = await searchParams;
  return <AppShell page="13-analytics.html" user={user} allowed={allowed}>{allowed ? <AnalyticsScreen initialTab={typeof tab === 'string' ? tab : undefined} /> : null}</AppShell>;
}
