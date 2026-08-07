'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, DatabaseBackup, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { useConfig } from '../config-context';

const CONFIRMATION = 'confirmo borrar datos';
const CATEGORIES = [
  { id: 'ventas', title: 'Ventas', description: 'Borra las ventas, sus ítems y comprobantes fiscales asociados.' },
  { id: 'movimientos', title: 'Movimientos', description: 'Borra el historial de movimientos de stock. No modifica el stock actual.' },
  { id: 'compras', title: 'Compras', description: 'Borra compras e ítems comprados. Los lotes conservados dejan de referenciar la compra.' },
  { id: 'clientes', title: 'Clientes', description: 'Borra clientes, pagos y saldos. Las ventas quedan conservadas sin cliente asociado.' },
  { id: 'productos', title: 'Productos', description: 'Borra todos los productos, lotes, movimientos y referencias asociadas. Las ventas históricas quedan sin producto.' },
  { id: 'productos-importados', title: 'Productos importados', description: 'Borra productos originados en proveedores y todo el catálogo sincronizado.' },
  { id: 'stock', title: 'Stock', description: 'Pone en cero el stock de todos los productos y borra todos los lotes. No borra productos.' },
  { id: 'promociones', title: 'Promociones', description: 'Borra todas las promociones y sus reglas configuradas.' },
  { id: 'figuritas-pedidos', title: 'Pedidos de figuritas', description: 'Borra los pedidos de figuritas y todos sus ítems.' },
  { id: 'vendedores', title: 'Vendedores', description: 'Borra vendedores y sesiones de trabajo. Las ventas quedan sin vendedor asociado.' },
  { id: 'usuarios', title: 'Usuarios', description: 'Borra los demás usuarios. Tu usuario nunca se elimina y recibe las ventas que necesiten conservar autor.' },
  { id: 'configuracion', title: 'Configuración', description: 'Resetea apariencia, pantalla cliente, IA y demás posConfig. La configuración fiscal no se toca.' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];
type Backup = { id: string; category: string; rowCount: number; createdAt: string; expiresAt: string };
type WipeResult = { category: string; deleted: number; backupId: string; expiresAt: string };

export default function EliminarDatosPage() {
  const { refetch } = useConfig();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [expanded, setExpanded] = useState<CategoryId | null>(null);
  const [confirmations, setConfirmations] = useState<Partial<Record<CategoryId, string>>>({});
  const [busy, setBusy] = useState<CategoryId | null>(null);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [result, setResult] = useState<WipeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try { setBackups(await api<Backup[]>('/data-admin/backups')); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los respaldos.'); }
    finally { setLoadingBackups(false); }
  }, []);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  const wipe = async (category: CategoryId) => {
    if (confirmations[category] !== CONFIRMATION) return;
    setBusy(category); setError(null); setResult(null);
    try {
      const nextResult = await api<WipeResult>('/data-admin/wipe', {
        method: 'POST',
        body: JSON.stringify({ category, confirm: confirmations[category] }),
      });
      setResult(nextResult);
      setConfirmations((current) => ({ ...current, [category]: '' }));
      setExpanded(null);
      await loadBackups();
      if (category === 'configuracion') {
        await refetch();
        window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
      }
    } catch (wipeError) {
      setError(wipeError instanceof Error ? wipeError.message : 'No se pudieron eliminar los datos.');
    } finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <PageHeader title="Eliminar datos" subtitle="Herramientas destructivas para limpiar información del negocio." />

    <section className="rounded-xl border border-crit/40 bg-[var(--crit-soft)] p-5">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-crit" /><div><h2 className="text-lg font-bold text-crit">Zona de peligro</h2><p className="mt-1 text-sm leading-relaxed text-fg-muted">Estas acciones eliminan información operativa y no se pueden deshacer desde esta pantalla. Antes de cada borrado se guarda un respaldo interno durante 30 días, pero no lo tomes como reemplazo de una copia permanente. Revisá cuidadosamente la categoría antes de confirmar.</p></div></div>
    </section>

    {error && <div className="rounded-xl border border-crit/30 bg-[var(--crit-soft)] px-4 py-3 text-sm text-crit">{error}</div>}
    {result && <div className="rounded-xl border border-ok/30 bg-[var(--ok-soft)] px-4 py-3 text-sm text-ok"><strong>Borrado completado:</strong> {result.deleted} filas respaldadas/afectadas. Backup disponible hasta <span className="font-mono tabular-nums">{new Date(result.expiresAt).toLocaleString('es-AR')}</span>.</div>}

    <div className="grid gap-3">
      {CATEGORIES.map((category) => {
        const isOpen = expanded === category.id;
        const confirmation = confirmations[category.id] ?? '';
        return <section key={category.id} className="rounded-xl border border-hair-soft bg-surface p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-fg">{category.title}</h2><p className="mt-1 text-sm text-fg-muted">{category.description}</p></div><button type="button" disabled={busy !== null} onClick={() => { setExpanded(isOpen ? null : category.id); setError(null); }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-crit/30 px-3 py-2 text-sm font-medium text-crit hover:bg-[var(--crit-soft)] disabled:opacity-50"><Trash2 className="h-4 w-4" />Eliminar</button></div>
          {isOpen && <div className="mt-4 rounded-xl border border-crit/30 bg-raised p-4"><p className="text-sm font-medium text-crit">Confirmación obligatoria</p><p className="mt-1 text-sm text-fg-muted">Escribí exactamente <code className="rounded bg-raised2 px-1.5 py-0.5 font-mono text-fg">{CONFIRMATION}</code> para habilitar el borrado.</p><input autoFocus value={confirmation} onChange={(event) => setConfirmations((current) => ({ ...current, [category.id]: event.target.value }))} autoComplete="off" spellCheck={false} className="mt-3 w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-fg placeholder:text-fg-faint focus:border-crit focus:outline-none" placeholder={CONFIRMATION} /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy !== null} onClick={() => setExpanded(null)} className="rounded-lg border border-hair px-4 py-2 text-sm text-fg-muted hover:bg-raised2">Cancelar</button><button type="button" disabled={confirmation !== CONFIRMATION || busy !== null} onClick={() => void wipe(category.id)} className="rounded-lg border border-crit bg-crit px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === category.id ? 'Creando backup y borrando…' : 'Confirmar borrado'}</button></div></div>}
        </section>;
      })}
    </div>

    <section className="rounded-xl border border-hair-soft bg-surface p-5">
      <div className="mb-4 flex items-start gap-3"><DatabaseBackup className="mt-0.5 h-5 w-5 text-fg-muted" /><div><h2 className="font-semibold text-fg">Respaldos (30 días)</h2><p className="text-sm text-fg-muted">Se guardan automáticamente antes de borrar y se purgan solos al cumplirse un mes. La lista no expone el contenido del respaldo.</p></div></div>
      {loadingBackups ? <Loader size="sm" label="Respaldos" /> : backups.length === 0 ? <p className="rounded-lg border border-hair-soft bg-raised p-5 text-center text-sm text-fg-faint">No hay respaldos vigentes.</p> : <div className="overflow-x-auto rounded-xl border border-hair-soft"><table className="w-full text-sm"><thead className="bg-raised text-left text-xs uppercase tracking-wide text-fg-faint"><tr><th className="px-3 py-3">Categoría</th><th className="px-3 py-3 text-right">Filas</th><th className="px-3 py-3">Creado</th><th className="px-3 py-3">Vence</th></tr></thead><tbody className="divide-y divide-hair-soft">{backups.map((backup) => <tr key={backup.id}><td className="px-3 py-3 font-medium text-fg">{CATEGORIES.find((category) => category.id === backup.category)?.title ?? backup.category}</td><td className="px-3 py-3 text-right font-mono tabular-nums text-fg-muted">{backup.rowCount}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums text-fg-muted">{new Date(backup.createdAt).toLocaleString('es-AR')}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-xs tabular-nums text-warn">{new Date(backup.expiresAt).toLocaleString('es-AR')}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
