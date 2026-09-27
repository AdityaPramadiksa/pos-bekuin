import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Aktif hanya bila path persis sama (untuk Beranda). */
  end?: boolean;
  /** Path lain yang ikut menyalakan tab ini (mis. halaman Diproses milik tab Order). */
  alsoActive?: string[];
}

const underPath = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.end ? pathname === item.to : underPath(pathname, item.to)) return true;
  return item.alsoActive?.some((p) => underPath(pathname, p)) ?? false;
}
