import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Reset your password — DemandAI' };

export default function Page() {
  return <ForgotPasswordForm />;
}
