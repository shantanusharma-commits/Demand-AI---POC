import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { ProspectingScreen } from '@/components/screens/ProspectingScreen';

// Was legacy/10-prospecting.html
export const metadata: Metadata = { title: 'Prospecting — DemandAI Pilot' };

export default function Page() {
  return <AppShell page="10-prospecting.html"><ProspectingScreen /></AppShell>;
}
