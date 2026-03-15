'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type Supplier = { id: string; name: string; phone?: string; email?: string };

type Props = {
  value: string;
  onChange: (supplierId: string) => void;
  suppliers: Supplier[];
  onSuppliersChange: (s: Supplier[]) => void;
  placeholder?: string;
  className?: string;
};

export function SupplierSelector({
  value,
  onChange,
  suppliers,
  onSuppliersChange,
  placeholder = 'Proveedor',
  className = '',
}: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const sup = await api<Supplier>('/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      onSuppliersChange([...(Array.isArray(suppliers) ? suppliers : []), sup]);
      onChange(sup.id);
      setNewName('');
      setAdding(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="space-y-2">
      {!adding ? (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 ${className}`}
          >
            <option value="">{placeholder}</option>
            {(Array.isArray(suppliers) ? suppliers : []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white text-sm whitespace-nowrap"
            title="Crear proveedor nuevo"
          >
            + Nuevo
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre del nuevo proveedor"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            autoFocus
          />
          <button type="button" onClick={handleAdd} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm">
            Crear
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewName(''); }}
            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-400 text-sm"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
