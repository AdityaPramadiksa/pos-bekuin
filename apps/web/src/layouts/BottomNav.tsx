import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavItem } from './nav';

// Lekukan di bawah bulatan. Lebar 128, tinggi = tinggi bar (64); pusat bulatan di x = 64.
// Garis dilebarkan 1px ke kiri-kanan supaya tidak ada celah tipis dengan bagian bar yang lurus.
const NOTCH_WIDTH = 128;
const NOTCH_PATH =
  'M-1 0H18C28 0 30 5 34 12C40 26 50 36 64 36C78 36 88 26 94 12C98 5 100 0 110 0H129V64H-1Z';

// Sedikit memantul saat bulatan berpindah tab.
const MOVE = 'duration-500 ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none';

/**
 * Bottom tab bar di HP: bar putih berlekuk dengan bulatan merah yang meluncur ke tab aktif.
 * Bulatan & lekukan digeser lewat `left` (persentase lebar bar), jadi ikut lebar layar apa pun.
 */
export function BottomNav({
  items,
  activeIndex,
  badge,
}: {
  items: NavItem[];
  activeIndex: number;
  badge: (to: string, placement: 'icon' | 'circle') => ReactNode;
}) {
  const active = activeIndex >= 0 ? items[activeIndex] : undefined;
  // Titik tengah tab aktif, dalam persen lebar bar.
  const center = `${((activeIndex + 0.5) * 100) / items.length}%`;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 [filter:drop-shadow(0_-2px_6px_rgb(0_0_0/0.08))] md:hidden"
      style={{ '--nav-center': center } as CSSProperties}
    >
      <div className="relative h-16">
        {/* Latar bar: [bar lurus][lekukan][bar lurus] digeser supaya lekukan tepat di tab aktif */}
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          {active ? (
            <div
              className={cn('absolute top-0 flex h-full transition-[left]', MOVE)}
              style={{ left: `calc(var(--nav-center) - 100vw - ${NOTCH_WIDTH / 2}px)` }}
            >
              <div className="h-full w-screen shrink-0 bg-white" />
              <svg
                width={NOTCH_WIDTH}
                height="64"
                viewBox={`0 0 ${NOTCH_WIDTH} 64`}
                className="shrink-0 overflow-visible"
              >
                <path d={NOTCH_PATH} fill="white" />
              </svg>
              <div className="h-full w-screen shrink-0 bg-white" />
            </div>
          ) : (
            <div className="h-full bg-white" />
          )}
        </div>

        {active && (
          <span
            aria-hidden
            className={cn(
              'bg-brand-700 shadow-brand-700/40 pointer-events-none absolute -top-[18px] flex size-12 -translate-x-1/2 items-center justify-center rounded-full text-white shadow-lg transition-[left]',
              MOVE,
            )}
            style={{ left: 'var(--nav-center)' }}
          >
            {/* key berganti tiap pindah tab → ikon baru muncul dengan animasi */}
            <active.icon
              key={active.to}
              className="animate-nav-pop size-5 motion-reduce:animate-none"
            />
            {badge(active.to, 'circle')}
          </span>
        )}

        <ul className="relative flex h-full">
          {items.map((item, i) => {
            const isActive = i === activeIndex;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-end gap-1 pb-2 text-[11px] font-medium transition-colors',
                    isActive ? 'text-brand-700 font-semibold' : 'text-stone-500',
                  )}
                >
                  <span
                    className={cn(
                      'relative transition-all duration-300',
                      isActive ? 'translate-y-3 scale-50 opacity-0' : 'opacity-100',
                    )}
                  >
                    <item.icon className="size-5" />
                    {!isActive && badge(item.to, 'icon')}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pb-safe bg-white" />
    </nav>
  );
}
