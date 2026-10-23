import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { StudioScreen } from '@/components/screens/StudioScreen';

// Was legacy/15-content-studio.html. ?item= opens a piece.
export const metadata: Metadata = { title: 'Content studio — DemandAI' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, allowed } = await requirePage('15-content-studio.html');
  const { item } = await searchParams;
  return <AppShell page="15-content-studio.html" user={user} allowed={allowed}>{allowed ? <StudioScreen initialItem={typeof item === 'string' ? item : undefined} /> : null}</AppShell>;
}
