// Generic skeleton for any (app) page without its own loading.tsx (Home, Sell, Plans...).
export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-48" />
      <div className="grid grid-cols-2 gap-3"><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
      <div className="menu">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[176px]" />)}</div>
    </div>
  );
}
