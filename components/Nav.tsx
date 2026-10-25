'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Role } from '@/lib/auth';

// Stroke icons, 24x24. Decorative: the text label names the link.
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  sell: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
  sales: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  plans: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  import: 'M12 4v12M7 9l5-5 5 5M4 20h16',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
} as const;

const ITEMS: { href: string; label: string; icon: keyof typeof ICONS; owner?: boolean }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/sell', label: 'Sell', icon: 'sell' },
  { href: '/sales', label: 'Sales', icon: 'sales' },
  { href: '/plans', label: 'Plans', icon: 'plans', owner: true },
  { href: '/import', label: 'Import', icon: 'import', owner: true },
  { href: '/settings', label: 'Settings', icon: 'settings', owner: true },
];

export function Nav({ role }: { role: Role }) {
  const path = usePathname();
  const receipt = useSearchParams().get('receipt') === '1';
  const items = ITEMS.filter((i) => !i.owner || role === 'owner');
  const active = items.findIndex((i) => (i.href === '/' ? path === '/' : path.startsWith(i.href)));
  if (receipt) return null; // screenshot mode: nothing but the receipt
  return (
    <nav aria-label="Main" className="nav" data-none={active < 0 ? '' : undefined}
      style={{ '--n': items.length, '--i': Math.max(active, 0) } as React.CSSProperties}>
      <span className="nav-pill" aria-hidden="true" />
      {items.map((i, idx) => (
        <Link key={i.href} href={i.href} aria-current={idx === active ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[i.icon]} /></svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
