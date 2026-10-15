import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { TodayScreen } from '@/components/screens/TodayScreen';

// Was legacy/00-today.html
export const metadata: Metadata = { title: 'Today — DemandAI Pilot' };

export default function Page() {
  return <AppShell page="00-today.html"><TodayScreen /></AppShell>;
}
