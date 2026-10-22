import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { requirePage } from '@/lib/server/auth/page';
import { UsersScreen } from '@/components/screens/UsersScreen';

// Was legacy/08-users.html
export const metadata: Metadata = { title: 'Users and roles — DemandAI' };

export default async function Page() {
  const { user, allowed } = await requirePage('08-users.html');
  return <AppShell page="08-users.html" user={user} allowed={allowed}>{allowed ? <UsersScreen /> : null}</AppShell>;
}
