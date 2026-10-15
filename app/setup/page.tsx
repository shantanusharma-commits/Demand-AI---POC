import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { SetupScreen } from '@/components/screens/SetupScreen';

// Was legacy/09-setup.html
export const metadata: Metadata = { title: 'Setup — DemandAI Pilot' };

export default function Page() {
  return <AppShell page="09-setup.html"><SetupScreen /></AppShell>;
}
