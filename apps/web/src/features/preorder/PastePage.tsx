import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { PasteImport } from './PasteImport';

export function PastePage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Tempel Pesan WhatsApp"
        subtitle="Satu pesan → banyak order pre-order sekaligus"
      />
      <PasteImport onSaved={() => navigate('/admin/order/rekap')} />
    </>
  );
}
