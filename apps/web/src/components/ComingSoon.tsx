import { Hammer } from 'lucide-react';

/** Penanda halaman yang dikerjakan di sprint berikutnya (lihat PRD bagian 10). */
export function ComingSoon({ sprint, features }: { sprint: string; features: string[] }) {
  return (
    <div className="mx-auto max-w-xl p-4 md:p-6">
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-5">
        <div className="flex items-center gap-2 text-amber-700">
          <Hammer className="size-5" />
          <p className="text-sm font-semibold">Dikerjakan di {sprint}</p>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-600">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
