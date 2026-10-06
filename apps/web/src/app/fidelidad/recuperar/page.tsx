'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { loyaltyApi } from '@/lib/loyalty-public';

function Form() {
  const params = useSearchParams();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const token = params.get('token') || '';
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <h1 className="text-2xl font-bold">Nuevo PIN</h1>
      <input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" placeholder="4 a 6 números" className="mt-4 w-full rounded-xl border border-hair bg-raised px-4 py-4" />
      <button
        type="button"
        className="mt-3 w-full rounded-xl bg-green-600 py-4 font-bold text-white"
        onClick={() => void loyaltyApi('/public/loyalty/pin/reset', { method: 'POST', body: JSON.stringify({ token, pin }) }).then(() => setMessage('PIN actualizado. Ya podés entrar.')).catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo cambiar el PIN.'))}
      >
        Guardar PIN
      </button>
      {message && <p className="mt-3 text-fg-muted">{message}</p>}
    </main>
  );
}

export default function RecuperarPinPage() {
  return (
    <Suspense fallback={<p className="p-6 text-fg-muted">Cargando…</p>}>
      <Form />
    </Suspense>
  );
}
