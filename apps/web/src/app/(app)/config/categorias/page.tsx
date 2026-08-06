'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { api } from '@/lib/api';
import { BusinessCategory, useConfig } from '../config-context';

export default function CategoriasPage() {
  const { categories, setCategories } = useConfig();
  const [newCategory, setNewCategory] = useState('');
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newCategory.trim()) return;
    try { const cat = await api<BusinessCategory>('/business/categories', { method: 'POST', body: JSON.stringify({ name: newCategory.trim() }) }); setCategories((c) => [...c, cat]); setNewCategory(''); }
    catch (err) { alert(err instanceof Error ? err.message : 'Error'); }
  };
  return <div className="space-y-6"><PageHeader title="Categorías" subtitle="Organizá las categorías disponibles para tus productos." />
    <div data-tour="config-categorias" className="rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
      <form onSubmit={handleAddCategory} className="mb-4 flex gap-2"><input type="text" placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 rounded-lg border border-hair bg-raised px-3 py-2 text-fg" /><button type="submit" className="btn-brand rounded-lg px-4 py-2">Agregar</button></form>
      <ul className="space-y-2">{categories.map((category) => <li key={category.id} className="rounded-lg border border-hair-soft bg-raised px-3 py-2 text-fg-muted">{category.name}</li>)}</ul>
    </div></div>;
}
