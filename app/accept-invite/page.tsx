import type { Metadata } from 'next';
import { AcceptInviteForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Set your password — DemandAI', referrer: 'no-referrer' };

export default function Page() {
  return <AcceptInviteForm />;
}
