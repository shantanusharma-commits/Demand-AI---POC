import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { ContentScreen } from '@/components/screens/ContentScreen';

// Was legacy/07-content.html
export const metadata: Metadata = { title: 'Content library — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('07-content.html');
  return <AppShell page="07-content.html" user={user} allowed={allowed}>{allowed ? <ContentScreen /> : null}</AppShell>;
}
