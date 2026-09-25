import type { Role, UserView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, useUsers } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const dateTime = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Makassar',
});

export function UsersPage() {
  const users = useUsers();
  const [editing, setEditing] = useState<UserView | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Pengguna"
        subtitle="Akun staff dan admin"
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Pengguna
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-6">
        {users.isPending ? (
          <LoadingState />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState title="Belum ada pengguna" />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {users.data.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => setEditing(u)}
                  className={cn(
                    'flex w-full items-center gap-3 p-4 text-left hover:bg-stone-50',
                    !u.isActive && 'opacity-60',
                  )}
                >
                  <div className="flex size-10 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                    <UserRound className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium">{u.name}</p>
                      <Badge tone={u.role === 'ADMIN' ? 'brand' : 'neutral'}>
                        {u.role === 'ADMIN' ? 'Admin' : 'Staff'}
                      </Badge>
                      {!u.isActive && <Badge>Nonaktif</Badge>}
                      {u.isActive && u.mustChangePassword && (
                        <Badge tone="amber">Belum ganti password</Badge>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      @{u.username} ·{' '}
                      {u.lastLoginAt
                        ? `login terakhir ${dateTime.format(new Date(u.lastLoginAt))}`
                        : 'belum pernah login'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <UserDialog
        key={editing === 'new' ? 'new' : editing?.id}
        user={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function UserDialog({ user, onClose }: { user: UserView | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isNew = user === 'new';
  const current = user && user !== 'new' ? user : null;
  const [form, setForm] = useState({
    name: current?.name ?? '',
    username: current?.username ?? '',
    password: '',
    role: (current?.role ?? 'STAFF') as Role,
    isActive: current?.isActive ?? true,
  });
  const [newPassword, setNewPassword] = useState('');
  const isSelf = current?.id === me?.id;

  const onSuccess = (message: string) => () => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: queryKeys.users });
    onClose();
  };

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (isNew) {
        await api.post('/users', {
          name: form.name,
          username: form.username,
          password: form.password,
          role: form.role,
        });
      } else {
        await api.patch(`/users/${current!.id}`, {
          name: form.name,
          role: form.role,
          isActive: form.isActive,
        });
      }
    },
    onSuccess: onSuccess(isNew ? 'Pengguna dibuat' : 'Pengguna disimpan'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reset = useMutation({
    mutationFn: () => api.post(`/users/${current!.id}/reset-password`, { password: newPassword }),
    onSuccess: onSuccess('Password direset. User wajib menggantinya saat login.'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isNew && form.password.length < 8) return toast.error('Password minimal 8 karakter');
    save.mutate();
  }

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={isNew ? 'Tambah Pengguna' : `Edit ${current?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field
          label="Username"
          hint={
            isNew ? 'Huruf kecil, angka, titik, atau garis bawah' : 'Username tidak bisa diubah'
          }
        >
          <Input
            value={form.username}
            disabled={!isNew}
            autoCapitalize="none"
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
          />
        </Field>
        {isNew && (
          <Field
            label="Password awal"
            hint="Minimal 8 karakter. User wajib menggantinya saat login pertama."
          >
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        )}
        <Field label="Role" hint={isSelf ? 'Role akun sendiri tidak bisa diturunkan' : undefined}>
          <Select
            value={form.role}
            disabled={isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="STAFF">Staff — input order (POS)</option>
            <option value="ADMIN">Admin — approve, menu, stok, laporan</option>
          </Select>
        </Field>
        {!isNew && !isSelf && (
          <SwitchRow
            title="Akun aktif"
            description="Nonaktif = tidak bisa login, sesi yang sedang jalan langsung berakhir"
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
        )}
      </form>

      {current && !isSelf && (
        <div className="mt-5 space-y-2 border-t border-stone-100 pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4" /> Reset password
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Password sementara (min. 8)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={newPassword.length < 8}
              loading={reset.isPending}
              onClick={() => reset.mutate()}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
