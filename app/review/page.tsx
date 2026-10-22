import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { ReviewScreen } from '@/components/screens/ReviewScreen';

// Was legacy/14-review.html
export const metadata: Metadata = { title: 'For Review — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('14-review.html');
  return <AppShell page="14-review.html" user={user} allowed={allowed}>{allowed ? <ReviewScreen /> : null}</AppShell>;
}
