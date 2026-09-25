import { Field, Select } from '@/components/ui/input';
import { useTables } from '@/lib/queries';

/** Pilih meja untuk order makan di sini (opsional). */
export function TablePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const tables = useTables();
  const active = (tables.data ?? []).filter((t) => t.isActive && t.code !== 'TAKEAWAY');
  if (active.length === 0) return null;
  return (
    <Field label="Meja (opsional)">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Tanpa meja —</option>
        {active.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
