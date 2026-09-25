import type { LoginResponse } from '@bekuin/shared';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';

export const API_URL: string = import.meta.env.VITE_API_URL || '/api/v1';

/** Origin API untuk file upload: kosong bila API di alamat yang sama (proxy dev). */
const API_ORIGIN = /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : '';

/** "/uploads/menu/x.webp" -> URL yang bisa dipakai di <img>. */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`;
}

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Satu proses refresh untuk banyak request yang gagal bersamaan.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setSession, clear } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<LoginResponse>(`${API_URL}/auth/refresh`, { refreshToken });
    setSession(data);
    return data.accessToken;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status !== 401 || !original || original._retry || isAuthCall) {
      throw error;
    }
    original._retry = true;
    refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
    const token = await refreshing;
    if (!token) throw error;
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

/** Ambil pesan error dari respons NestJS agar bisa ditampilkan di toast. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
    if ([500, 502, 503, 504].includes(error.response?.status ?? 0)) {
      return 'Server API belum siap. Tunggu sebentar lalu coba lagi.';
    }
    if (!error.response) return 'Tidak bisa terhubung ke server. Pastikan API sudah jalan.';
  }
  return 'Terjadi kesalahan';
}
