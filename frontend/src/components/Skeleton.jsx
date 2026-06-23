function Sk({ className = '' }) {
  return <div className={`bg-white/[0.05] rounded-lg animate-pulse ${className}`} />
}

export function SkKpiCard() {
  return (
    <div className="bg-bg2 rounded-xl border border-border px-4 py-3">
      <Sk className="h-2.5 w-28 rounded-full mb-2.5" />
      <Sk className="h-7 w-20 mb-1.5" />
      <Sk className="h-2 w-16 rounded-full mb-3" />
      <Sk className="h-5 w-full opacity-40" />
    </div>
  )
}

export function SkChartCard({ height = 340, titleWidth = 'w-36' }) {
  return (
    <div className="bg-bg2 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <Sk className={`h-3.5 ${titleWidth} rounded-full`} />
        <Sk className="h-6 w-14 rounded-full" />
      </div>
      <div className="w-full rounded-xl bg-white/[0.03]" style={{ height }} />
    </div>
  )
}

export function SkTableCard({ rows = 6 }) {
  return (
    <div className="bg-bg2 rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <Sk className="h-3.5 w-40 rounded-full" />
        <Sk className="h-5 w-20 rounded-full ml-auto opacity-60" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-2.5" style={{ opacity: 1 - i * 0.1 }}>
            <Sk className="h-2.5 w-24 rounded-full flex-shrink-0" />
            <Sk className="h-2.5 flex-1 rounded-full" />
            <Sk className="h-2.5 w-16 rounded-full flex-shrink-0" />
            <Sk className="h-2.5 w-20 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkFilterBar({ pills = 7 }) {
  const widths = [82, 115, 68, 60, 60, 60, 60, 68, 78]
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 bg-bg2 border-b border-border">
      {widths.slice(0, pills).map((w, i) => (
        <div key={i} className="h-7 rounded-full bg-white/[0.05] animate-pulse flex-shrink-0" style={{ width: w }} />
      ))}
      <div className="flex-1" />
      {[68, 80].map((w, i) => (
        <div key={i} className="h-7 rounded-full bg-white/[0.05] animate-pulse flex-shrink-0" style={{ width: w }} />
      ))}
    </div>
  )
}

export function SkeletonCustos() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SkFilterBar pills={7} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => <SkKpiCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SkChartCard height={360} titleWidth="w-44" />
          <SkChartCard height={360} titleWidth="w-36" />
        </div>
        <SkChartCard height={260} titleWidth="w-48" />
        <SkTableCard rows={7} />
      </div>
    </div>
  )
}

export function SkeletonReceitas() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SkFilterBar pills={4} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <SkKpiCard key={i} />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <SkKpiCard key={i} />)}
        </div>
        <SkChartCard height={150} titleWidth="w-56" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SkChartCard height={340} titleWidth="w-44" />
          <SkChartCard height={340} titleWidth="w-36" />
        </div>
        <SkChartCard height={260} titleWidth="w-48" />
        <SkTableCard rows={7} />
      </div>
    </div>
  )
}

export function SkeletonOcupacao() {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="bg-bg2 rounded-2xl border border-white/[0.05] p-2.5 space-y-1.5 animate-pulse">
          <Sk className="h-2 w-14 rounded-full" />
          <Sk className="h-5 w-16" />
          <Sk className="h-2 w-10 rounded-full opacity-60" />
        </div>
      ))}
    </>
  )
}
