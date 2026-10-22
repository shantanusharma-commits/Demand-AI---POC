'use client';

// The signed-in person, as the server described them for this page load. Screens use it to hide what the role
// can't use; the server checks every request again regardless.
import { createContext, useContext, type ReactNode } from 'react';
import { can, type Action, type SessionUser } from '@/lib/auth/permissions';

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSessionUser outside SessionProvider');
  return user;
}

export function useCan(action: Action): boolean {
  const user = useContext(SessionContext);
  return can(user?.activeBusinessUnit?.role, action);
}
