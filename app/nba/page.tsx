import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { NbaScreen } from '@/components/screens/NbaScreen';

// Was legacy/12-nba.html
export const metadata: Metadata = { title: 'Next Best Action — DemandAI' };

export default function Page() {
  return <AppShell page="12-nba.html"><NbaScreen /></AppShell>;
}
