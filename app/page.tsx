import { redirect } from 'next/navigation';
import { homePage, PAGES } from '@/lib/auth/permissions';
import { currentUser } from '@/lib/server/auth/page';

// Each role lands on its first screen: Today for most, Analytics for a Viewer, Business units for a platform admin.
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const home = homePage(user.activeBusinessUnit?.role);
  redirect(home ? PAGES[home].route : user.platformAdmin ? '/platform' : '/today');
}
