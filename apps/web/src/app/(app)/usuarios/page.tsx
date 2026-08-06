'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';

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
    <Container className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Administrá accesos, roles y permisos del equipo."
        actions={<button type="button" onClick={() => setShowForm(!showForm)} data-tour="usuarios-nuevo" className="px-4 py-2 rounded-lg btn-brand font-medium">
          {showForm ? 'Cerrar' : 'Nuevo usuario'}
        </button>}
      />

      {showForm && (
        <form data-tour="usuarios-form" onSubmit={handleCreate} className="max-w-md space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5">
          <input
            type="email"
            placeholder="Email *"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            required
          />
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            required
          />
          <input
            type="password"
            placeholder="Contraseña *"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair00 text-fg"
          >
            <option value="CAJERO">Cajero</option>
            <option value="ADMIN">Admin</option>
            <option value="REPOSITOR">Repositor</option>
            <option value="LECTOR">Lector</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">Crear usuario</button>
        </form>
      )}

      {loading ? (
        <p className="text-fg-faint">Cargando...</p>
      ) : (
        <div data-tour="usuarios-list" className="overflow-hidden rounded-xl border border-hair-soft bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-raised text-fg-muted">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Rol</th>
                <th className="text-left p-3">Estado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair-soft00">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-raised">
                  <td className="p-3 text-fg">{u.name}</td>
                  <td className="p-3 text-fg-muted">{u.email}</td>
                  <td className="p-3 text-fg-muted">{u.role}</td>
                  <td className="p-3">
                    <span className={u.isActive ? 'text-ok' : 'text-crit'}>{u.isActive ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="p-3">
                    {u.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u.id, u.isActive)}
                        className="text-brand hover:underline text-xs"
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
    </Container>
  );
}
