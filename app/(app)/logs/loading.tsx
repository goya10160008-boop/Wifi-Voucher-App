export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-32" />
      <div className="skeleton h-24" />
      <div className="skeleton h-12" />
      <div className="skeleton h-28" />
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
    </div>
  );
}
