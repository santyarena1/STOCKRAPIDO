'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type User = { id: string; email: string; name: string; role: string; isActive: boolean };

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CAJERO' });

  useEffect(() => {
    api<User[]>('/users').then(setUsers).catch(() => []).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ email: '', name: '', password: '', role: 'CAJERO' });
      setShowForm(false);
      const list = await api<User[]>('/users');
      setUsers(list);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive }),
      });
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, isActive: !isActive } : x)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Usuarios</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} data-tour="usuarios-nuevo" className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
          {showForm ? 'Cerrar' : 'Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form data-tour="usuarios-form" onSubmit={handleCreate} className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6 mb-6 max-w-md">
          <input
            type="email"
            placeholder="Email *"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            required
          />
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            required
          />
          <input
            type="password"
            placeholder="Contraseña *"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          >
            <option value="CAJERO">Cajero</option>
            <option value="ADMIN">Admin</option>
            <option value="REPOSITOR">Repositor</option>
            <option value="LECTOR">Lector</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white">Crear usuario</button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : (
        <div data-tour="usuarios-list" className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Rol</th>
                <th className="text-left p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/50">
                  <td className="p-3 text-slate-200">{u.name}</td>
                  <td className="p-3 text-slate-400">{u.email}</td>
                  <td className="p-3 text-slate-400">{u.role}</td>
                  <td className="p-3">
                    <span className={u.isActive ? 'text-green-400' : 'text-red-400'}>{u.isActive ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="p-3">
                    {u.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u.id, u.isActive)}
                        className="text-sky-400 hover:underline text-xs"
                      >
                        {u.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
