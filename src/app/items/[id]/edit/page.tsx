import ItemForm from '@/components/ItemForm';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemForm key={id} itemId={id} />;
}
