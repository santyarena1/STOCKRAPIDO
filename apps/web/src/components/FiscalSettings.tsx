'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { INVOICE_ALERT_PERIOD_LABELS, type InvoiceAlertPeriod } from '@/lib/invoice-alert';

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
  invoiceAlertPeriod?: InvoiceAlertPeriod;
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
  invoiceAlertPeriod: InvoiceAlertPeriod;
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
  invoiceAlertPeriod: 'calendar_month',
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
          invoiceAlertLimit: c.invoiceAlertLimit != null ? String(c.invoiceAlertLimit) : '',
          invoiceAlertPercent: c.invoiceAlertPercent ?? 80,
          invoiceAlertPeriod: c.invoiceAlertPeriod || 'calendar_month',
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
        invoiceAlertLimit: form.invoiceAlertLimit.trim() === '' ? null : Number(form.invoiceAlertLimit.replace(',', '.')),
        invoiceAlertPercent: form.invoiceAlertPercent,
        invoiceAlertPeriod: form.invoiceAlertPeriod,
      };
      const c = await api<FiscalConfig>('/fiscal/config', { method: 'PUT', body: JSON.stringify(body) });
      setMeta(c);
      setForm((f) => ({ ...f, certificate: '', privateKey: '' }));
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

      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-amber-200">Aviso de tope facturado</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Antes de emitir la próxima Factura C, avisamos si el acumulado del período se acerca al monto que definas.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 shrink-0">
            <input
              type="checkbox"
              checked={form.invoiceAlertEnabled}
              onChange={(e) => setForm((f) => ({ ...f, invoiceAlertEnabled: e.target.checked }))}
            />
            Activado
          </label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-slate-400">Monto límite</label>
            <input
              className={input}
              inputMode="decimal"
              placeholder="Ej. 5000000"
              value={form.invoiceAlertLimit}
              onChange={(e) => setForm((f) => ({ ...f, invoiceAlertLimit: e.target.value }))}
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
          <div>
            <label className="text-sm text-slate-400">Período</label>
            <select
              className={input}
              value={form.invoiceAlertPeriod}
              onChange={(e) => setForm((f) => ({ ...f, invoiceAlertPeriod: e.target.value as InvoiceAlertPeriod }))}
            >
              {(Object.keys(INVOICE_ALERT_PERIOD_LABELS) as InvoiceAlertPeriod[]).map((id) => (
                <option key={id} value={id}>
                  {INVOICE_ALERT_PERIOD_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.includes('correct') || message.includes('guardada') ? 'text-emerald-400' : 'text-amber-300'}`}>
          {message}
        </p>
      )}
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
