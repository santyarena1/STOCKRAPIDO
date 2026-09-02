'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CHANGELOG, CURRENT_VERSION, formatChangelogDate, TAG_STYLE } from '@/lib/changelog';

const SEEN_KEY = 'sr-changelog-seen';

/** Enlace en el menú lateral, arriba de Cerrar sesión. */
export function ChangelogNavLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/changelog"
      onClick={onNavigate}
      title="Ver novedades y changelog"
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-raised hover:text-fg"
    >
      <span aria-hidden>🔔</span>
      <span className="min-w-0 flex-1 truncate">Novedades</span>
      <span className="shrink-0 rounded-md bg-[color:var(--brand-accent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
        {CURRENT_VERSION}
      </span>
    </Link>
  );
}

/** Popup de novedades al entrar (una vez por versión). */
export function ChangelogWidget() {
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);
  const latest = CHANGELOG[0];

  useEffect(() => {
    if (!latest) return;
    try {
      if (localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION) setShowPopup(true);
    } catch {
      /* localStorage no disponible */
    }
  }, [latest]);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
    } catch {
      /* noop */
    }
    setShowPopup(false);
  };

  const openFull = () => {
    dismiss();
    router.push('/changelog');
  };

  if (!showPopup || !latest) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={dismiss}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-hair bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hair-soft px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
            <span aria-hidden>⭐</span> Novedades · {formatChangelogDate(latest.date)}
          </h2>
          <button type="button" onClick={dismiss} className="rounded-lg px-2 py-1 text-fg-muted hover:bg-raised">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {latest.summary && <p className="mb-4 text-sm text-fg-muted">{latest.summary}</p>}
          <ul className="space-y-4">
            {latest.items.map((item, i) => (
              <li key={i} className="flex gap-3 border-b border-hair-soft/60 pb-4 last:border-0 last:pb-0">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${TAG_STYLE[item.tag]}`}
                >
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

        <div className="flex items-center justify-end gap-2 border-t border-hair-soft px-5 py-3">
          <button
            type="button"
            onClick={openFull}
            className="rounded-lg border border-hair bg-surface px-4 py-2 text-sm font-medium text-fg hover:bg-raised"
          >
            Ver más
          </button>
          <button type="button" onClick={dismiss} className="btn-brand rounded-lg px-4 py-2 text-sm font-semibold">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
