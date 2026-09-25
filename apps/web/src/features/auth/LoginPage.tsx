import type { LoginResponse } from '@bekuin/shared';
import { loginSchema } from '@bekuin/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, setSession } = useAuthStore();
  const [form, setForm] = useState({ username: '', password: '' });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: async (body: typeof form) =>
      (await api.post<LoginResponse>('/auth/login', body)).data,
    onSuccess: (session) => {
      setSession(session);
      navigate(session.user.mustChangePassword ? '/ganti-password' : '/', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (user) return <Navigate to="/" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Isian tidak valid');
      return;
    }
    setFieldError(null);
    login.mutate(parsed.data);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm"
      >
        <div className="text-center">
          <img src="/favicon.svg" alt="" className="mx-auto size-14" />
          <h1 className="text-brand-700 mt-3 text-xl font-bold">Bekuin POS</h1>
          <p className="text-sm text-stone-500">Masuk sebagai Admin atau Staff</p>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Username</span>
          <input
            autoFocus
            autoComplete="username"
            className="focus:border-brand-600 mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="focus:border-brand-600 mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 outline-none"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {fieldError && <p className="text-sm text-red-600">{fieldError}</p>}

        <button
          type="submit"
          disabled={login.isPending}
          className="bg-brand-700 hover:bg-brand-800 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {login.isPending && <Loader2 className="size-4 animate-spin" />}
          Masuk
        </button>
      </form>
    </div>
  );
}
