import Link from 'next/link';
import type { Role } from '@/lib/auth';

const ITEMS: { href: string; label: string; owner?: boolean }[] = [
  { href: '/', label: 'Home' },
  { href: '/sell', label: 'Sell' },
  { href: '/sales', label: 'Sales' },
  { href: '/plans', label: 'Plans', owner: true },
  { href: '/import', label: 'Import', owner: true },
  { href: '/settings', label: 'Settings', owner: true },
];

export function Nav({ role }: { role: Role }) {
  const items = ITEMS.filter((i) => !i.owner || role === 'owner');
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-gray-300 bg-white pb-[env(safe-area-inset-bottom)]">
      {items.map((i) => (
        <Link key={i.href} href={i.href}
          className="flex min-h-14 flex-1 items-center justify-center text-sm font-medium">
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
