import { requireUser } from '@/lib/auth';
import { Nav } from '@/components/Nav';
import { logout } from '../(auth)/login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireUser();
  if (!role) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">No access</h1>
        <p>Your account is not set up yet. Ask the owner to add you.</p>
        <form action={logout}>
          <button className="min-h-12 rounded-lg border border-gray-400 px-4">Sign out</button>
        </form>
      </main>
    );
  }
  return (
    <div className="mx-auto max-w-2xl p-4 pb-24">
      {children}
      <Nav role={role} />
    </div>
  );
}
