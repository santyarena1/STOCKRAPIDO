'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Container } from '@/components/ui/Container';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loader } from '@/components/ui/Loader';

type User = { id: string; email: string; name: string; role: string; isActive: boolean };

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'CAJERO' });
  const [drafts, setDrafts] = useState<Record<string, { name: string; email: string }>>({});

  const loadUsers = async () => {
    const list = await api<User[]>('/users');
    setUsers(list);
    setDrafts(
      Object.fromEntries(list.map((u) => [u.id, { name: u.name, email: u.email }])),
    );
  };

  useEffect(() => {
    void loadUsers().catch(() => []).finally(() => setLoading(false));
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
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleSave = async (user: User) => {
    const draft = drafts[user.id];
    if (!draft) return;
    const name = draft.name.trim();
    const email = draft.email.trim().toLowerCase();
    if (!name || !email) return alert('Nombre y email son obligatorios.');
    setBusyId(user.id);
    try {
      const updated = await api<User>(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, email }),
      });
      setUsers((rows) => rows.map((row) => (row.id === user.id ? updated : row)));
      setDrafts((current) => ({ ...current, [user.id]: { name: updated.name, email: updated.email } }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusyId(null);
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

  const isDirty = (user: User) => {
    const draft = drafts[user.id];
    if (!draft) return false;
    return draft.name.trim() !== user.name || draft.email.trim().toLowerCase() !== user.email.toLowerCase();
  };

  return (
    <Container className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Administrá accesos, roles y permisos del equipo."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            data-tour="usuarios-nuevo"
            className="px-4 py-2 rounded-lg btn-brand font-medium"
          >
            {showForm ? 'Cerrar' : 'Nuevo usuario'}
          </button>
        }
      />

      {showForm && (
        <form
          data-tour="usuarios-form"
          onSubmit={handleCreate}
          className="max-w-md space-y-4 rounded-xl border border-hair-soft bg-surface p-4 sm:p-5"
        >
          <input
            type="email"
            placeholder="Email *"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
            required
          />
          <input
            type="text"
            placeholder="Nombre *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
            required
          />
          <input
            type="password"
            placeholder="Contraseña *"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-raised border border-hair-soft text-fg"
          >
            <option value="CAJERO">Cajero</option>
            <option value="ADMIN">Admin</option>
            <option value="REPOSITOR">Repositor</option>
            <option value="LECTOR">Lector</option>
          </select>
          <button type="submit" className="px-4 py-2 rounded-lg btn-brand">
            Crear usuario
          </button>
        </form>
      )}

      {loading ? (
        <Loader />
      ) : (
        <div data-tour="usuarios-list" className="overflow-x-auto rounded-xl border border-hair-soft bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-raised text-fg-muted">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Email</th>
                <th className="hidden text-left p-3 sm:table-cell">Rol</th>
                <th className="text-left p-3">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair-soft">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-raised align-top">
                  <td className="p-3">
                    <input
                      value={drafts[u.id]?.name ?? u.name}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [u.id]: { ...(current[u.id] ?? { name: u.name, email: u.email }), name: e.target.value },
                        }))
                      }
                      className="w-full min-w-[120px] rounded-lg border border-hair bg-raised px-2.5 py-1.5 text-fg"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="email"
                      value={drafts[u.id]?.email ?? u.email}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [u.id]: { ...(current[u.id] ?? { name: u.name, email: u.email }), email: e.target.value },
                        }))
                      }
                      className="w-full min-w-[160px] rounded-lg border border-hair bg-raised px-2.5 py-1.5 text-fg"
                    />
                  </td>
                  <td className="hidden p-3 text-fg-muted sm:table-cell">{u.role}</td>
                  <td className="p-3">
                    <span className={u.isActive ? 'text-ok' : 'text-crit'}>{u.isActive ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap space-x-2">
                    <button
                      type="button"
                      disabled={busyId === u.id || !isDirty(u)}
                      onClick={() => void handleSave(u)}
                      className="text-brand hover:underline text-xs disabled:opacity-40"
                    >
                      {busyId === u.id ? 'Guardando…' : 'Guardar'}
                    </button>
                    {u.role !== 'OWNER' && (
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(u.id, u.isActive)}
                        className="text-fg-muted hover:text-fg text-xs"
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
