'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoneyInputArs, parseMoneyInputArs } from '@/lib/units';

type FiscalConfig = {
  enabled: boolean;
  environment: 'homologation' | 'production';
  cuit: string;
  pointOfSale: number;
  legalName?: string;
  grossIncomeNumber?: string;
  activityStartDate?: string;
  address?: string;
  hasCertificate: boolean;
  hasPrivateKey: boolean;
  certificateExpiresAt?: string;
  invoiceAlertEnabled?: boolean;
  invoiceAlertLimit?: number | null;
  invoiceAlertPercent?: number;
  invoiceYearAlertEnabled?: boolean;
  invoiceYearAlertLimit?: number | null;
  invoiceYearAlertPercent?: number;
  portalUsername?: string;
  hasPortalPassword?: boolean;
  receivedAutoSync?: boolean;
  receivedLastSyncAt?: string | null;
  receivedLastSyncError?: string | null;
  receivedLastSyncCount?: number | null;
  afipSdkConfigured?: boolean;
};
type FiscalForm = {
  enabled: boolean;
  environment: 'homologation' | 'production';
  cuit: string;
  pointOfSale: number;
  legalName: string;
  grossIncomeNumber: string;
  activityStartDate: string;
  address: string;
  certificate: string;
  privateKey: string;
  invoiceAlertEnabled: boolean;
  invoiceAlertLimit: string;
  invoiceAlertPercent: number;
  invoiceYearAlertEnabled: boolean;
  invoiceYearAlertLimit: string;
  invoiceYearAlertPercent: number;
  portalUsername: string;
  portalPassword: string;
  receivedAutoSync: boolean;
};
const empty: FiscalForm = {
  enabled: false,
  environment: 'homologation',
  cuit: '',
  pointOfSale: 1,
  legalName: '',
  grossIncomeNumber: '',
  activityStartDate: '',
  address: '',
  certificate: '',
  privateKey: '',
  invoiceAlertEnabled: false,
  invoiceAlertLimit: '',
  invoiceAlertPercent: 80,
  invoiceYearAlertEnabled: false,
  invoiceYearAlertLimit: '',
  invoiceYearAlertPercent: 80,
  portalUsername: '',
  portalPassword: '',
  receivedAutoSync: false,
};
export default function FiscalSettings() {
  const [form, setForm] = useState(empty);
  const [meta, setMeta] = useState<FiscalConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<FiscalConfig | null>('/fiscal/config')
      .then((c) => {
        if (!c) return;
        setMeta(c);
        setForm((f) => ({
          ...f,
          enabled: c.enabled,
          environment: c.environment,
          cuit: c.cuit,
          pointOfSale: c.pointOfSale,
          legalName: c.legalName || '',
          grossIncomeNumber: c.grossIncomeNumber || '',
          activityStartDate: c.activityStartDate?.slice(0, 10) || '',
          address: c.address || '',
          invoiceAlertEnabled: !!c.invoiceAlertEnabled,
          invoiceAlertLimit: formatMoneyInputArs(c.invoiceAlertLimit),
          invoiceAlertPercent: c.invoiceAlertPercent ?? 80,
          invoiceYearAlertEnabled: !!c.invoiceYearAlertEnabled,
          invoiceYearAlertLimit: formatMoneyInputArs(c.invoiceYearAlertLimit),
          invoiceYearAlertPercent: c.invoiceYearAlertPercent ?? 80,
          portalUsername: c.portalUsername || c.cuit || '',
          portalPassword: '',
          receivedAutoSync: !!c.receivedAutoSync,
        }));
      })
      .catch(() => {});
  }, []);
  const readFile = (file: File | undefined, key: 'certificate' | 'privateKey') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, [key]: String(reader.result || '') }));
    reader.readAsText(file);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const body = {
        enabled: form.enabled,
        environment: form.environment,
        cuit: form.cuit,
        pointOfSale: form.pointOfSale,
        legalName: form.legalName,
        grossIncomeNumber: form.grossIncomeNumber,
        activityStartDate: form.activityStartDate || undefined,
        address: form.address,
        certificate: form.certificate || undefined,
        privateKey: form.privateKey || undefined,
        invoiceAlertEnabled: form.invoiceAlertEnabled,
        invoiceAlertLimit: parseMoneyInputArs(form.invoiceAlertLimit),
        invoiceAlertPercent: form.invoiceAlertPercent,
        invoiceYearAlertEnabled: form.invoiceYearAlertEnabled,
        invoiceYearAlertLimit: parseMoneyInputArs(form.invoiceYearAlertLimit),
        invoiceYearAlertPercent: form.invoiceYearAlertPercent,
        portalUsername: form.portalUsername,
        portalPassword: form.portalPassword || undefined,
        receivedAutoSync: form.receivedAutoSync,
      };
      const c = await api<FiscalConfig>('/fiscal/config', { method: 'PUT', body: JSON.stringify(body) });
      setMeta(c);
      setForm((f) => ({
        ...f,
        certificate: '',
        privateKey: '',
        invoiceAlertLimit: formatMoneyInputArs(c.invoiceAlertLimit),
        invoiceYearAlertLimit: formatMoneyInputArs(c.invoiceYearAlertLimit),
        portalPassword: '',
      }));
      setMessage('Configuración fiscal guardada.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    setMessage('');
    try {
      const r = await api<{ message: string; lastAuthorized: number }>('/fiscal/test', { method: 'POST' });
      setMessage(`${r.message} Última Factura C: ${r.lastAuthorized}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Falló la prueba');
    } finally {
      setTesting(false);
    }
  };
  const input = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100';
  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-cyan-800/50 bg-cyan-950/15 p-6 mb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-cyan-200">Facturación electrónica ARCA</h2>
          <p className="text-xs text-slate-500 mt-1">Configuración propia de este kiosco para emitir Factura C desde el POS.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} /> Activada
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-slate-400">Ambiente</label>
          <select className={input} value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value as 'homologation' | 'production' }))}>
            <option value="homologation">Homologación (pruebas)</option>
            <option value="production">Producción (facturas reales)</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-400">Punto de venta WSFE</label>
          <input className={input} type="number" min="1" max="99999" value={form.pointOfSale} onChange={(e) => setForm((f) => ({ ...f, pointOfSale: Number(e.target.value) }))} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-slate-400">CUIT emisor</label>
          <input className={input} value={form.cuit} onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))} placeholder="20XXXXXXXXX" required />
        </div>
        <div>
          <label className="text-sm text-slate-400">Razón social / nombre fiscal</label>
          <input className={input} value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="text-sm text-slate-400">Domicilio comercial</label>
        <input className={input} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-slate-400">Ingresos Brutos</label>
          <input className={input} value={form.grossIncomeNumber} onChange={(e) => setForm((f) => ({ ...f, grossIncomeNumber: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm text-slate-400">Inicio de actividades</label>
          <input className={input} type="date" value={form.activityStartDate} onChange={(e) => setForm((f) => ({ ...f, activityStartDate: e.target.value }))} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-slate-400">Certificado ARCA (.crt/.pem)</label>
          <input className="block w-full text-sm text-slate-400 mt-1" type="file" accept=".crt,.pem,.cer" onChange={(e) => readFile(e.target.files?.[0], 'certificate')} />
          <p className={`text-xs mt-1 ${meta?.hasCertificate ? 'text-emerald-400' : 'text-amber-400'}`}>
            {meta?.hasCertificate
              ? `Cargado${meta.certificateExpiresAt ? ' · vence ' + new Date(meta.certificateExpiresAt).toLocaleDateString() : ''}`
              : 'Sin certificado'}
          </p>
        </div>
        <div>
          <label className="text-sm text-slate-400">Clave privada (.key/.pem)</label>
          <input className="block w-full text-sm text-slate-400 mt-1" type="file" accept=".key,.pem" onChange={(e) => readFile(e.target.files?.[0], 'privateKey')} />
          <p className={`text-xs mt-1 ${meta?.hasPrivateKey ? 'text-emerald-400' : 'text-amber-400'}`}>
            {meta?.hasPrivateKey ? 'Cargada y protegida' : 'Sin clave privada'}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">Los archivos se cifran en la API y nunca vuelven a mostrarse ni se guardan en GitHub.</p>

      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-amber-200">Topes y avisos de facturación</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Podés configurar un tope mensual y otro anual a la vez. Antes de emitir Factura C avisamos si te acercás a cualquiera.
          </p>
        </div>

        <div className="space-y-3 rounded-md border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-200 font-medium">Tope mensual</p>
            <label className="flex items-center gap-2 text-sm text-slate-300 shrink-0">
              <input
                type="checkbox"
                checked={form.invoiceAlertEnabled}
                onChange={(e) => setForm((f) => ({ ...f, invoiceAlertEnabled: e.target.checked }))}
              />
              Activado
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-400">Monto límite del mes</label>
              <input
                className={`${input} font-mono tabular-nums`}
                inputMode="numeric"
                placeholder="$ 0"
                value={form.invoiceAlertLimit}
                onChange={(e) => setForm((f) => ({ ...f, invoiceAlertLimit: formatMoneyInputArs(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm text-slate-400">Avisar desde (%)</label>
              <input
                className={input}
                type="number"
                min={1}
                max={100}
                value={form.invoiceAlertPercent}
                onChange={(e) => setForm((f) => ({ ...f, invoiceAlertPercent: Number(e.target.value) || 80 }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-200 font-medium">Tope anual</p>
            <label className="flex items-center gap-2 text-sm text-slate-300 shrink-0">
              <input
                type="checkbox"
                checked={form.invoiceYearAlertEnabled}
                onChange={(e) => setForm((f) => ({ ...f, invoiceYearAlertEnabled: e.target.checked }))}
              />
              Activado
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-400">Monto límite del año</label>
              <input
                className={`${input} font-mono tabular-nums`}
                inputMode="numeric"
                placeholder="$ 0"
                value={form.invoiceYearAlertLimit}
                onChange={(e) => setForm((f) => ({ ...f, invoiceYearAlertLimit: formatMoneyInputArs(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm text-slate-400">Avisar desde (%)</label>
              <input
                className={input}
                type="number"
                min={1}
                max={100}
                value={form.invoiceYearAlertPercent}
                onChange={(e) => setForm((f) => ({ ...f, invoiceYearAlertPercent: Number(e.target.value) || 80 }))}
              />
            </div>
          </div>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.includes('correct') || message.includes('guardada') ? 'text-emerald-400' : 'text-amber-300'}`}>
          {message}
        </p>
      )}
      
      <div className="rounded-lg border border-cyan-800/40 bg-slate-900/40 p-4 space-y-3">
        <div>
          <h3 className="font-medium text-cyan-100">Facturas recibidas (automático)</h3>
          <p className="text-xs text-slate-500 mt-1">
            ARCA no tiene API oficial para listar compras. Con tu Clave Fiscal sincronizamos Mis Comprobantes → Recibidos
            (solo montos para balance, sin cargar stock). El CSV queda como respaldo.
          </p>
        </div>
        {!meta?.afipSdkConfigured ? (
          <p className="text-xs text-amber-300">
            El servidor todavía no tiene <code>AFIP_SDK_ACCESS_TOKEN</code>. Pedile al admin de plataforma que lo configure para habilitar el sync automático.
          </p>
        ) : null}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-400">Usuario Clave Fiscal</label>
            <input
              className={input}
              value={form.portalUsername}
              onChange={(e) => setForm((f) => ({ ...f, portalUsername: e.target.value }))}
              placeholder="CUIT (o CUIT del administrador)"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400">Contraseña Clave Fiscal</label>
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              value={form.portalPassword}
              onChange={(e) => setForm((f) => ({ ...f, portalPassword: e.target.value }))}
              placeholder={meta?.hasPortalPassword ? '•••••••• (cargada)' : 'Contraseña de ARCA'}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.receivedAutoSync}
            onChange={(e) => setForm((f) => ({ ...f, receivedAutoSync: e.target.checked }))}
          />
          Sincronizar solo todos los días (últimos ~30 días)
        </label>
        {meta?.receivedLastSyncAt ? (
          <p className="text-xs text-slate-500">
            Último sync: {new Date(meta.receivedLastSyncAt).toLocaleString('es-AR')}
            {meta.receivedLastSyncCount != null ? ` · ${meta.receivedLastSyncCount} comprobantes` : ''}
            {meta.receivedLastSyncError ? ` · Error: ${meta.receivedLastSyncError}` : ''}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button disabled={saving} className="px-4 py-2 rounded-lg btn-brand disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar ARCA'}
        </button>
        <button
          type="button"
          disabled={testing || !meta?.hasCertificate || !meta?.hasPrivateKey}
          onClick={test}
          className="px-4 py-2 rounded-lg border border-cyan-700 text-cyan-200 hover:bg-cyan-950 disabled:opacity-40"
        >
          {testing ? 'Probando comunicación...' : 'Probar comunicación'}
        </button>
      </div>
    </form>
  );
}
