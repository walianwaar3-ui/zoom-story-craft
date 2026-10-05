import { pipelineStages } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

export function PipelineFunnel() {
  const max = pipelineStages[0].count;
  return (
    <ul className="space-y-3.5">
      {pipelineStages.map((s, i) => {
        const pct = (s.count / max) * 100;
        const conv = i > 0 ? Math.round((s.count / pipelineStages[i - 1].count) * 100) : null;
        return (
          <li key={s.stage} className="group" title={`${s.stage}: ${s.count}${s.value ? ` · ${formatCurrency(s.value)}` : ""}`}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{s.stage}</span>
              <span className="flex items-baseline gap-2">
                {conv !== null && <span className="text-[11px] text-muted-foreground tabular">{conv}% conv.</span>}
                <span className="font-medium tabular">{s.count}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-1 transition-opacity group-hover:opacity-80"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
