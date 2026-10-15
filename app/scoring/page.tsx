import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { ScoringScreen } from '@/components/screens/ScoringScreen';

// Was legacy/11-scoring.html
export const metadata: Metadata = { title: 'Account Scoring — DemandAI' };

export default function Page() {
  return <AppShell page="11-scoring.html"><ScoringScreen /></AppShell>;
}
