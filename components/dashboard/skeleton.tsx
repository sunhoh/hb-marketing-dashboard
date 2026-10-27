export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-8 pb-16 sm:px-6 lg:px-8" aria-busy>
      <div className="h-5 w-48 animate-pulse rounded-md bg-card" />
      <div className="mt-3 h-9 w-64 animate-pulse rounded-lg bg-card" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[136px] animate-pulse rounded-card bg-card" />
        ))}
      </div>
    </div>
  );
}
