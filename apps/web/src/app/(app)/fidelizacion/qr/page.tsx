'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '@/lib/api';

export default function FidelizacionQrPage() {
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<{ url: string; businessName: string; programName: string }>('/loyalty/qr')
      .then(async (data) => {
        setUrl(data.url);
        setName(data.businessName);
        setImage(await QRCode.toDataURL(data.url, { width: 480, margin: 1 }));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Activá fidelización primero.'));
  }, []);

  if (message) return <p className="text-fg">{message}</p>;
  if (!image) return <p className="text-fg-muted">Cargando…</p>;

  return (
    <div className="mx-auto max-w-md rounded-xl border border-hair bg-surface p-5 text-center">
      <p className="text-sm text-fg-muted">{name}</p>
      <h2 className="mb-4 text-xl font-bold text-fg">QR fijo del local</h2>
      <img src={image} alt="QR de fidelización" className="mx-auto w-full max-w-xs rounded-lg bg-white p-3" />
      <p className="mt-3 break-all text-xs text-fg-faint">{url}</p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a href={image} download="fidelizacion-qr.png" className="rounded-lg border border-hair py-3 text-sm font-medium text-fg">Descargar</a>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-hair py-3 text-sm font-medium text-fg">Imprimir</button>
        <button type="button" onClick={() => void navigator.clipboard.writeText(url)} className="btn-brand rounded-lg py-3 text-sm font-medium">Copiar URL</button>
      </div>
    </div>
  );
}
