import ItemForm from '@/components/ItemForm';

export default function EditItemPage({ params }: { params: { id: string } }) {
  return <ItemForm key={params.id} itemId={params.id} />;
}
