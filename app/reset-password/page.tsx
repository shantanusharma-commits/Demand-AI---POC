import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Choose a new password — DemandAI', referrer: 'no-referrer' };

export default function Page() {
  return <ResetPasswordForm />;
}
