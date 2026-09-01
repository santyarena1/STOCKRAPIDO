'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { STOCKRAPIDO_BRANDING_EVENT } from '@/lib/branding';
import { ONBOARDING_STEPS, type OnboardingState } from '@/lib/onboarding';
import { Loader } from '@/components/ui/Loader';

const STEP_INDEX: Record<string, number> = Object.fromEntries(ONBOARDING_STEPS.map((s, i) => [s.id, i]));

export default function SetupPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState({ name: '', accent: '#e31c23', logoUrl: '' });
  const [categoryName, setCategoryName] = useState('Bebidas');
  const [product, setProduct] = useState({ name: '', price: '', barcode: '' });
  const [cajaCash, setCajaCash] = useState('0');

  useEffect(() => {
    api<OnboardingState>('/business/onboarding')
      .then((o) => {
        setState(o);
        if (o.finishedAt) {
          router.replace('/dashboard');
          return;
        }
        const firstPending = ONBOARDING_STEPS.findIndex(
          (s) => !o.completedSteps.includes(s.id) && !o.skippedSteps.includes(s.id),
        );
        setStep(firstPending >= 0 ? firstPending : 0);
      })
      .catch(() => setState({ completedSteps: [], skippedSteps: [], tourVersion: 2, finishedAt: null }));
    api<{ name: string; posConfig?: { branding?: { accentColor?: string; logoUrl?: string } } }>('/business/me')
      .then((b) => {
        setBrand({
          name: b.name || '',
          accent: b.posConfig?.branding?.accentColor || '#e31c23',
          logoUrl: b.posConfig?.branding?.logoUrl || '',
        });
      })
      .catch(() => {});
  }, [router]);

  const patch = async (body: Parameters<typeof api>[1] extends { body: infer B } ? never : Record<string, unknown>) => {
    const updated = await api<OnboardingState>('/business/onboarding', { method: 'PATCH', body: JSON.stringify(body) });
    setState(updated);
    return updated;
  };

  const skip = async () => {
    const id = ONBOARDING_STEPS[step]?.id;
    if (!id) return;
    setBusy(true);
    try {
      const updated = await patch({ skipStep: id });
      goNext(updated);
    } finally {
      setBusy(false);
    }
  };

  const goNext = (updated: OnboardingState) => {
    if (updated.finishedAt) {
      router.push('/dashboard');
      return;
    }
    const next = ONBOARDING_STEPS.findIndex(
      (s) => !updated.completedSteps.includes(s.id) && !updated.skippedSteps.includes(s.id),
    );
    if (next < 0) {
      void patch({ finish: true }).then(() => router.push('/dashboard'));
    } else setStep(next);
  };

  const saveBrand = async () => {
    setBusy(true);
    try {
      await api('/business/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: brand.name,
          posConfig: { branding: { accentColor: brand.accent, logoUrl: brand.logoUrl || undefined, appTitle: brand.name } },
        }),
      });
      window.dispatchEvent(new Event(STOCKRAPIDO_BRANDING_EVENT));
      const updated = await patch({ completeStep: 'brand' });
      goNext(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async () => {
    setBusy(true);
    try {
      if (categoryName.trim()) {
        await api('/business/categories', { method: 'POST', body: JSON.stringify({ name: categoryName.trim() }) });
      }
      const updated = await patch({ completeStep: 'categories' });
      goNext(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const saveProduct = async () => {
    if (!product.name.trim()) return alert('Nombre obligatorio');
    setBusy(true);
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: product.name.trim(),
          price: parseFloat(product.price) || 0,
          barcode: product.barcode || undefined,
          stock: 0,
          minStock: 0,
        }),
      });
      const updated = await patch({ completeStep: 'first_product' });
      goNext(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const saveCaja = async () => {
    setBusy(true);
    try {
      await api('/caja/open', {
        method: 'POST',
        body: JSON.stringify({ openingCash: parseFloat(cajaCash) || 0, openingBank: 0 }),
      });
      const updated = await patch({ completeStep: 'open_caja' });
      goNext(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const finishSale = async () => {
    setBusy(true);
    try {
      const updated = await patch({ completeStep: 'first_sale', finish: true });
      router.push(updated.finishedAt ? '/pos' : '/dashboard');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <Loader full label="Preparando tu kiosco" />;

  const current = ONBOARDING_STEPS[step];
  const progress = ((step + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-surface text-fg">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Configuración inicial</p>
          <h1 className="mt-1 text-2xl font-bold">{current?.title ?? 'Bienvenido'}</h1>
          <p className="text-sm text-fg-muted mt-1">{current?.desc}</p>
          <div className="mt-4 h-2 rounded-full bg-raised overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-fg-faint mt-1">Paso {step + 1} de {ONBOARDING_STEPS.length}</p>
        </div>

        <div className="rounded-xl border border-hair-soft bg-surface p-5 space-y-4 shadow-sm">
          {current?.id === 'brand' && (
            <>
              <label className="block text-sm">Nombre del kiosco
                <input className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" value={brand.name} onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))} />
              </label>
              <label className="block text-sm">Color principal
                <input type="color" className="mt-1 h-10 w-full rounded-lg" value={brand.accent} onChange={(e) => setBrand((b) => ({ ...b, accent: e.target.value }))} />
              </label>
              <button type="button" disabled={busy} onClick={() => void saveBrand()} className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">Guardar y continuar</button>
            </>
          )}
          {current?.id === 'categories' && (
            <>
              <label className="block text-sm">Primera categoría
                <input className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
              </label>
              <button type="button" disabled={busy} onClick={() => void saveCategory()} className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">Continuar</button>
            </>
          )}
          {current?.id === 'first_product' && (
            <>
              <input className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2" placeholder="Nombre del producto" value={product.name} onChange={(e) => setProduct((p) => ({ ...p, name: e.target.value }))} />
              <input className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" placeholder="Precio de venta" value={product.price} onChange={(e) => setProduct((p) => ({ ...p, price: e.target.value }))} />
              <input className="w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" placeholder="Código (opcional)" value={product.barcode} onChange={(e) => setProduct((p) => ({ ...p, barcode: e.target.value }))} />
              <button type="button" disabled={busy} onClick={() => void saveProduct()} className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">Crear producto</button>
            </>
          )}
          {current?.id === 'open_caja' && (
            <>
              <label className="block text-sm">Efectivo inicial en caja
                <input className="mt-1 w-full rounded-lg border border-hair-soft bg-raised px-3 py-2 font-mono" value={cajaCash} onChange={(e) => setCajaCash(e.target.value)} />
              </label>
              <button type="button" disabled={busy} onClick={() => void saveCaja()} className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">Abrir caja</button>
            </>
          )}
          {current?.id === 'first_sale' && (
            <>
              <p className="text-sm text-fg-muted">Listo para cobrar. Te llevamos al POS para tu primera venta.</p>
              <button type="button" disabled={busy} onClick={() => void finishSale()} className="btn-brand w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">Ir al POS</button>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 justify-between">
          <button type="button" onClick={() => void skip()} className="text-sm text-fg-muted hover:text-fg">Saltar este paso</button>
          <button type="button" onClick={() => void patch({ finish: true }).then(() => router.push('/dashboard'))} className="text-sm text-fg-faint hover:text-fg">Terminar después</button>
        </div>
        <p className="mt-6 text-center text-xs text-fg-faint">
          Podés retomar la configuración desde el <Link href="/dashboard" className="text-brand hover:underline">dashboard</Link>.
        </p>
      </div>
    </div>
  );
}
