'use client';

import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { CHANGELOG, formatChangelogDate, TAG_STYLE } from '@/lib/changelog';

export default function ChangelogPage() {
  return (
    <Container className="max-w-3xl space-y-6">
      <PageHeader title="Changelog" subtitle="Historial de versiones y novedades de StockRápido." />

      <div className="space-y-8">
        {CHANGELOG.map((version, idx) => (
          <section key={version.version} className="relative">
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-lg bg-[color:var(--brand-accent)] px-3 py-1 font-mono text-sm font-bold text-white">
                {version.version}
              </span>
              <span className="text-sm text-fg-muted">{formatChangelogDate(version.date)}</span>
              {idx === 0 && (
                <span className="rounded-md border border-[color:var(--ok)]/40 bg-[var(--ok-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase text-ok">
                  Última
                </span>
              )}
            </div>

            <div className={`rounded-2xl border bg-surface p-4 sm:p-5 ${idx === 0 ? 'border-[color:var(--brand-accent)]' : 'border-hair-soft'}`}>
              {version.summary && (
                <p className="mb-4 text-sm text-fg-muted">
                  <strong className="text-fg">En pocas palabras:</strong> {version.summary}
                </p>
              )}
              <ul className="space-y-4">
                {version.items.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-0.5 h-fit shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${TAG_STYLE[item.tag]}`}>
                      {item.tag}
                    </span>
                    <span className="min-w-0">
                      <span className="text-sm font-semibold text-fg">{item.title}: </span>
                      <span className="text-sm text-fg-muted">{item.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </Container>
  );
}
