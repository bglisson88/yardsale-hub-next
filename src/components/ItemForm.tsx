'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, addDoc, deleteField, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Upload, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { LoadingSpinner } from '@/components';
import CategoryFields from '@/components/CategoryFields';
import { categoryFields, getCategory } from '@/lib/categories';
import type { Item } from '@/types';

const emptyForm = {
  title: '',
  description: '',
  category: '',
  subcategory: '',
  itemType: '',
  price: '',
  originalPrice: '',
  condition: 'good',
  location: '',
};

export default function ItemForm({ itemId }: { itemId?: string }) {
  const { user, loading: authLoading } = useAuthStore();
  useAuthContext();
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<{ url: string; file?: File }[]>([]);
  const [formData, setFormData] = useState(emptyForm);
  const [loadedItem, setLoadedItem] = useState<{ key: string; item: Item } | null>(null);
  const [fetchError, setFetchError] = useState<{ key: string; message: string } | null>(null);
  const [taxonomyChanged, setTaxonomyChanged] = useState(false);
  const userId = user?.id;
  const previewURLs = useRef(new Set<string>());
  const mounted = useRef(false);
  const saveInProgress = useRef(false);
  const identity = `${user?.id ?? ''}:${itemId ?? 'new'}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const router = useRouter();

  useEffect(() => {
    mounted.current = true;
    const urls = previewURLs.current;
    return () => {
      mounted.current = false;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    let cancelled = false;
    setLoadedItem(null);
    setFetchError(null);
    setFormData(emptyForm);
    previewURLs.current.forEach(url => URL.revokeObjectURL(url));
    previewURLs.current.clear();
    setPhotos([]);
    setTaxonomyChanged(false);
    setLoading(false);
    if (!itemId || authLoading || !userId) return;
    const ownerId = userId;
    const editingId = itemId;
    async function loadItem() {
      try {
        const snapshot = await getDoc(doc(db, 'items', editingId));
        if (cancelled) return;
        if (!snapshot.exists()) throw new Error('Item not found.');
        const item = { ...snapshot.data(), id: snapshot.id } as Item;
        if (item.userId !== ownerId) throw new Error('You can only edit your own items.');
        setFormData({
          title: item.title,
          description: item.description ?? '',
          category: item.category ?? '',
          subcategory: item.subcategory ?? '',
          itemType: item.itemType ?? '',
          price: String(item.price),
          originalPrice: item.originalPrice == null ? '' : String(item.originalPrice),
          condition: item.condition,
          location: item.location ?? '',
        });
        setPhotos((item.photoURLs ?? []).map(url => ({ url })));
        setLoadedItem({ key: identity, item });
      } catch (error) {
        if (!cancelled) setFetchError({ key: identity, message: error instanceof Error ? error.message : 'Failed to load item.' });
      }
    }
    void loadItem();
    return () => { cancelled = true; };
  }, [itemId, authLoading, userId, identity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length > 5) {
      toast.error('Maximum 5 photos allowed');
      return;
    }

    const addedPhotos = files.map(file => {
      const url = URL.createObjectURL(file);
      previewURLs.current.add(url);
      return { file, url };
    });
    setPhotos(previous => [...previous, ...addedPhotos]);
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    const photo = photos[index];
    if (photo.file) {
      URL.revokeObjectURL(photo.url);
      previewURLs.current.delete(photo.url);
    }
    setPhotos(previous => previous.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saveInProgress.current || (itemId && loadedItem?.key !== identity)) return;
    const ownerId = user.id;
    const saveIdentity = identity;
    const assertCurrent = () => {
      if (!mounted.current || currentIdentity.current !== saveIdentity || auth.currentUser?.uid !== ownerId) {
        throw new Error('Your session changed. Please reload before saving.');
      }
    };
    saveInProgress.current = true;
    setLoading(true);

    try {
      if (!formData.title || !formData.price) {
        toast.error('Please fill in all required fields');
        return;
      }

      let taxonomy: { category: string; subcategory?: string; itemType?: string };
      if (itemId && !taxonomyChanged) {
        if (!loadedItem) throw new Error('Please reload the item before saving.');
        const original = loadedItem.item;
        taxonomy = {
          category: original.category,
          ...(original.subcategory ? { subcategory: original.subcategory } : {}),
          ...(original.itemType ? { itemType: original.itemType } : {}),
        };
      } else {
        taxonomy = categoryFields(
          formData.category,
          formData.subcategory || undefined,
          formData.itemType || undefined,
        );
      }
      if (!itemId && (!getCategory(formData.category) || !taxonomy.subcategory)) {
        throw new Error('Please select a category and subcategory.');
      }
      if ((!itemId || taxonomyChanged) && !getCategory(formData.category)) {
        throw new Error('Please select a valid category.');
      }
      assertCurrent();
      const itemRef = itemId ? doc(db, 'items', itemId) : null;
      const assertOwnership = async () => {
        if (itemRef) {
          const snapshot = await getDoc(itemRef);
          assertCurrent();
          if (!snapshot.exists()) throw new Error('Item not found.');
          if (snapshot.data().userId !== ownerId) throw new Error('You can only edit your own items.');
        }
      };
      await assertOwnership();

      // Upload photos
      const photoURLs: string[] = [];
      for (const photo of photos) {
        assertCurrent();
        if (!photo.file) {
          photoURLs.push(photo.url);
          continue;
        }
        const file = photo.file;
        const storageRef = ref(storage, `items/${user.id}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        photoURLs.push(downloadURL);
      }

      assertCurrent();
      const fields = {
        title: formData.title,
        description: formData.description,
        ...taxonomy,
        price: parseFloat(formData.price),
        originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : null,
        condition: formData.condition,
        location: formData.location || user.location,
        photoURLs,
        updatedAt: Timestamp.now(),
      };
      if (itemRef) {
        await assertOwnership();
        assertCurrent();
        await updateDoc(itemRef, {
          ...fields,
          ...(taxonomyChanged && !taxonomy.subcategory ? { subcategory: deleteField() } : {}),
          ...(taxonomyChanged && !taxonomy.itemType ? { itemType: deleteField() } : {}),
        });
      } else {
        await addDoc(collection(db, 'items'), {
          ...fields,
          userId: ownerId,
          createdAt: Timestamp.now(),
          views: 0,
          isSold: false,
        });
      }

      if (mounted.current && currentIdentity.current === saveIdentity) {
        toast.success(itemId ? 'Item updated successfully!' : 'Item posted successfully!');
        router.push('/dashboard');
      }
    } catch (error) {
      if (mounted.current && currentIdentity.current === saveIdentity) {
        toast.error(error instanceof Error ? error.message : 'Failed to save item');
      }
    } finally {
      saveInProgress.current = false;
      if (mounted.current && currentIdentity.current === saveIdentity) setLoading(false);
    }
  };

  if (authLoading || (user && itemId && loadedItem?.key !== identity && fetchError?.key !== identity)) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  }
  if (!user) return null;
  if (fetchError?.key === identity) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p role="alert">{fetchError.message}</p>
        <Link href="/dashboard" className="text-blue-600">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/dashboard" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6">
        <ArrowLeft size={20} /> Back to Dashboard
      </Link>

      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{itemId ? 'Edit Item' : 'Post an Item'}</h1>

        <form onSubmit={handleSubmit}>
          <fieldset disabled={loading} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Item Title *</label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Vintage Oak Coffee Table"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe your item in detail..."
            />
          </div>

          <CategoryFields
            category={formData.category}
            subcategory={formData.subcategory}
            itemType={formData.itemType}
            required
            requireSubcategory={!itemId}
            onChange={values => {
              setFormData(previous => ({ ...previous, ...values }));
              setTaxonomyChanged(true);
            }}
          />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Condition</label>
              <select
                name="condition"
                value={formData.condition}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="new">New</option>
                <option value="like-new">Like New</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>

          {/* Price */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Price ($) *</label>
              <input
                type="number"
                name="price"
                required
                step="0.01"
                value={formData.price}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Original Price (Optional)</label>
              <input
                type="number"
                name="originalPrice"
                step="0.01"
                value={formData.originalPrice}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
            <input
              type="text"
              name="location"
              value={formData.location || user.location}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your location"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-4">Photos (Max 5)</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="mx-auto text-gray-400 mb-2" size={32} />
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                id="photo-upload"
              />
              <label htmlFor="photo-upload" className="cursor-pointer">
                <span className="text-blue-600 font-semibold hover:underline">Click to upload</span>
                <span className="text-gray-600"> or drag and drop</span>
              </label>
              <p className="text-sm text-gray-500 mt-1">PNG, JPG up to 10MB each</p>
            </div>

            {photos.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-700 mb-3">{photos.length} photo(s) selected</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {photos.map(({ url }, index) => (
                    <div key={index} className="relative">
                      <img src={url} alt={`Preview ${index}`} className="w-full h-24 object-cover rounded-lg" />
                      <button
                        type="button"
                        aria-label={`Remove photo ${index + 1}`}
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-700"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? (itemId ? 'Saving...' : 'Publishing...') : (itemId ? 'Save Changes' : 'Publish Item')}
          </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
