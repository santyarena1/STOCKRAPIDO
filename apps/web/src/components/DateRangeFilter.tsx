'use client';

import {
  ANALYTICS_DATE_PRESETS,
  type AnalyticsDatePresetId,
  rangeForAnalyticsPreset,
} from '@/lib/argentina-date';

type Props = {
  preset: AnalyticsDatePresetId;
  from: string;
  to: string;
  onChange: (next: { preset: AnalyticsDatePresetId; from: string; to: string }) => void;
  className?: string;
};

export function DateRangeFilter({ preset, from, to, onChange, className = '' }: Props) {
  const applyPreset = (id: AnalyticsDatePresetId) => {
    if (id === 'personalizado') {
      onChange({ preset: id, from, to });
      return;
    }
    const range = rangeForAnalyticsPreset(id);
    onChange({ preset: id, from: range.from, to: range.to });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`} data-tour="date-range-filter">
      <div className="flex flex-wrap gap-1.5">
        {ANALYTICS_DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.title}
            onClick={() => applyPreset(p.id)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              preset === p.id
                ? 'border-[color:var(--brand-accent)] bg-brand-highlight text-brand'
                : 'border-hair bg-surface text-fg-muted hover:bg-raised'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) =>
              onChange({
                preset: 'personalizado',
                from: e.target.value,
                to: to && to < e.target.value ? e.target.value : to,
              })
            }
            className="rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) =>
              onChange({
                preset: 'personalizado',
                from: from && from > e.target.value ? e.target.value : from,
                to: e.target.value,
              })
            }
            className="rounded-lg border border-hair bg-raised px-2 py-1.5 text-sm text-fg"
          />
        </label>
      </div>
    </div>
  );
}
