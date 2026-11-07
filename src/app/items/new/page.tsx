import ItemForm from '@/components/ItemForm';

export default function NewItemPage({ searchParams }: { searchParams: { yardSaleId?: string } }) {
  return <ItemForm initialYardSaleId={searchParams.yardSaleId} />;
}
