import { Bell, KeyRound, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { useAuthStore } from '@/stores/auth';

export function AccountPage() {
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();

  async function logout() {
    // Perangkat bersama: jangan kirim notifikasi user ini lagi setelah keluar.
    await disablePush();
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
        <PushToggle isAdmin={user?.role === 'ADMIN'} />
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

function PushToggle({ isAdmin }: { isAdmin: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (!supported) return;
    void currentPushSubscription().then((sub) => setOn(!!sub));
  }, [supported]);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) await enablePush();
      else await disablePush();
      setOn(next);
      toast.success(next ? 'Notifikasi aktif di perangkat ini' : 'Notifikasi dimatikan');
    } catch (e) {
      toast.error(e instanceof Error && !('isAxiosError' in e) ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <Bell className="size-5 shrink-0 text-stone-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Notifikasi di perangkat ini</p>
        <p className="text-xs text-stone-500">
          {!supported
            ? 'Browser ini tidak mendukung notifikasi push.'
            : isAdmin
              ? 'Order baru & bukti bayar tetap muncul walau aplikasi ditutup.'
              : 'Kabar order Anda di-approve atau ditolak, walau aplikasi ditutup.'}
        </p>
      </div>
      {supported && (
        <Switch
          checked={!!on}
          disabled={busy || on === null}
          onChange={(next) => void toggle(next)}
          label="Notifikasi"
        />
      )}
    </div>
  );
}
