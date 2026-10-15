import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { UsersScreen } from '@/components/screens/UsersScreen';

// Was legacy/08-users.html
export const metadata: Metadata = { title: 'Users and roles — DemandAI' };

export default function Page() {
  return <AppShell page="08-users.html"><UsersScreen /></AppShell>;
}
