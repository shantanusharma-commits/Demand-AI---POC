import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { ContentScreen } from '@/components/screens/ContentScreen';

// Was legacy/07-content.html
export const metadata: Metadata = { title: 'Content library — DemandAI' };

export default function Page() {
  return <AppShell page="07-content.html"><ContentScreen /></AppShell>;
}
