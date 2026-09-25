import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Chips } from '@/components/ui/chips';
import { IngredientsTab } from './IngredientsTab';
import { RecipesTab } from './RecipesTab';

export function RecipesPage() {
  const [tab, setTab] = useState('ingredients');
  return (
    <>
      <PageHeader
        title="Bahan, Resep & HPP"
        subtitle="Biaya bahan → resep bertingkat → HPP per varian"
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { key: 'ingredients', label: 'Bahan Baku' },
            { key: 'recipes', label: 'Resep' },
          ]}
        />
        {tab === 'ingredients' ? <IngredientsTab /> : <RecipesTab />}
      </div>
    </>
  );
}
