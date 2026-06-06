'use client';

import { fig } from './theme';

export function AdminHero() {
  return (
    <div className={fig.hero}>
      <div className={fig.heroGlowA} />
      <div className={fig.heroGlowB} />
      <div className="relative px-4 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl sm:text-2xl">🏆</span>
              <span className={fig.badge}>Mundial 2026 · Panel</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black leading-tight">Álbum de Figuritas</h1>
            <p className="text-red-100/80 text-sm sm:text-base mt-2 max-w-xl">
              Gestioná precios, cargá stock en el álbum visual, compartí el link público y respondé pedidos.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:min-w-[240px]">
            {[
              { n: '48', l: 'Países' },
              { n: '∞', l: 'Stock' },
              { n: '🔗', l: 'Link' },
            ].map((s) => (
              <div key={s.l} className={`${fig.cardInner} px-2 py-2.5 sm:py-3 text-center`}>
                <p className={fig.statNum}>{s.n}</p>
                <p className={fig.statLabel}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
