import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { AnalyticsScreen } from '@/components/screens/AnalyticsScreen';

// Was legacy/13-analytics.html
export const metadata: Metadata = { title: 'Analytics — DemandAI' };

export default function Page() {
  return <AppShell page="13-analytics.html"><AnalyticsScreen /></AppShell>;
}
