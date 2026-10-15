import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { ReviewScreen } from '@/components/screens/ReviewScreen';

// Was legacy/14-review.html
export const metadata: Metadata = { title: 'For Review — DemandAI' };

export default function Page() {
  return <AppShell page="14-review.html"><ReviewScreen /></AppShell>;
}
