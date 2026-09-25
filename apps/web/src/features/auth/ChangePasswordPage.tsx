import { changePasswordSchema } from '@bekuin/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.patch('/auth/password', body),
    onSuccess: () => {
      // Semua sesi dicabut di server, jadi login ulang dengan password baru.
      toast.success('Password diganti, silakan login lagi');
      clear();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setFieldError('Konfirmasi password tidak sama');
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success)
      return setFieldError(parsed.error.issues[0]?.message ?? 'Isian tidak valid');
    setFieldError(null);
    change.mutate(parsed.data);
  }

  const fields = [
    ['currentPassword', 'Password lama', 'current-password'],
    ['newPassword', 'Password baru (min. 8 karakter)', 'new-password'],
    ['confirm', 'Ulangi password baru', 'new-password'],
  ] as const;

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-bold">Ganti Password</h1>
          {user?.mustChangePassword && (
            <p className="text-sm text-stone-500">
              Password awal wajib diganti sebelum memakai aplikasi.
            </p>
          )}
        </div>
        {fields.map(([key, label, autoComplete]) => (
          <label key={key} className="block text-sm">
            <span className="font-medium">{label}</span>
            <input
              type="password"
              autoComplete={autoComplete}
              className="focus:border-brand-600 mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        {fieldError && <p className="text-sm text-red-600">{fieldError}</p>}
        <button
          type="submit"
          disabled={change.isPending}
          className="bg-brand-700 w-full rounded-lg py-2.5 font-semibold text-white disabled:opacity-60"
        >
          Simpan
        </button>
      </form>
    </div>
  );
}
