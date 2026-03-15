'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type Category = { id: string; name: string };

type Props = {
  value: string;
  onChange: (categoryId: string) => void;
  categories: Category[];
  /** Puede ser un setter (array) o una función (prev => newArray) para evitar estado desactualizado */
  onCategoriesChange: (cats: Category[] | ((prev: Category[]) => Category[])) => void;
  placeholder?: string;
  className?: string;
};

export function CategorySelector({ value, onChange, categories, onCategoriesChange, placeholder = 'Categoría', className }: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const cat = await api<Category>('/business/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      onCategoriesChange((prev) => [...(Array.isArray(prev) ? prev : []), cat]);
      onChange(cat.id);
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
            className={`flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 ${className ?? ''}`}
          >
            <option value="">{placeholder}</option>
            {(Array.isArray(categories) ? categories : []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-3 py-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white text-sm whitespace-nowrap"
            title="Crear categoría nueva"
          >
            + Nueva
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre de la nueva categoría"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            autoFocus
          />
          <button type="button" onClick={handleAdd} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-sm">Crear</button>
          <button type="button" onClick={() => { setAdding(false); setNewName(''); }} className="px-3 py-2 rounded-lg border border-slate-600 text-slate-400 text-sm">Cancelar</button>
        </div>
      )}
    </div>
  );
}
