import { KeyRound, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function AccountPage() {
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();

  async function logout() {
    if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    clear();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <PageHeader title="Akun" />
      <div className="mx-auto max-w-xl space-y-3 p-4 md:p-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-stone-500">
            @{user?.username} · {user?.role === 'ADMIN' ? 'Admin' : 'Staff'}
          </p>
        </div>
        <Link
          to="/ganti-password"
          className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm font-medium shadow-sm"
        >
          <KeyRound className="size-5 text-stone-500" /> Ganti password
        </Link>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-sm font-medium text-red-600 shadow-sm"
        >
          <LogOut className="size-5" /> Keluar
        </button>
      </div>
    </>
  );
}
