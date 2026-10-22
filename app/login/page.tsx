import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/AuthForms';
import { currentUser } from '@/lib/server/auth/page';

export const metadata: Metadata = { title: 'Sign in — DemandAI' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/');
  const { next } = await searchParams;
  return <LoginForm next={typeof next === 'string' ? next : undefined} />;
}
