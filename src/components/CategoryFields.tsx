'use client';

import { CATEGORIES, getCategory, normalizeCategory, normalizeSubcategory } from '@/lib/categories';

export interface CategoryFieldsProps {
  category: string;
  subcategory: string;
  onChange: (category: string, subcategory: string) => void;
  required?: boolean;
  requireSubcategory?: boolean;
  disabled?: boolean;
}

interface ListingCategoryFieldsProps extends Omit<CategoryFieldsProps, 'onChange'> {
  itemType: string;
  onChange: (values: { category: string; subcategory: string; itemType: string }) => void;
}

const selectClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const labelClass = 'block text-sm font-semibold text-gray-700 mb-2';

export default function ListingCategoryFields({
  category, subcategory, itemType, required = false, requireSubcategory = false, disabled = false, onChange,
}: ListingCategoryFieldsProps) {
  const parent = getCategory(category);
  const child = parent?.subcategories.find(value => value.id === normalizeSubcategory(category, subcategory));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label htmlFor="item-category" className={labelClass}>Category{required && ' *'}</label>
        <select
          id="item-category"
          name="category"
          required={required}
          disabled={disabled}
          value={parent ? normalizeCategory(category) : category}
          onChange={event => onChange({ category: event.target.value, subcategory: '', itemType: '' })}
          className={selectClass}
        >
          <option value="">{required ? 'Select a category' : 'All categories'}</option>
          {category && !CATEGORIES.some(value => value.id === normalizeCategory(category)) && (
            <option value={normalizeCategory(category)}>{parent?.label ?? category} (legacy)</option>
          )}
          {CATEGORIES.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="item-subcategory" className={labelClass}>Subcategory{requireSubcategory && ' *'}</label>
        <select
          id="item-subcategory"
          name="subcategory"
          required={requireSubcategory}
          disabled={disabled || !parent}
          value={child?.id ?? subcategory}
          onChange={event => onChange({ category, subcategory: event.target.value, itemType: '' })}
          className={selectClass}
        >
          <option value="">{requireSubcategory ? 'Select a subcategory' : 'All subcategories'}</option>
          {subcategory && !child && <option value={subcategory}>{subcategory} (legacy)</option>}
          {parent?.subcategories.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </div>
      {(child?.itemTypes?.length || itemType) ? (
        <div>
          <label htmlFor="item-type" className={labelClass}>Item type (Optional)</label>
          <select
            id="item-type"
            name="itemType"
            disabled={disabled}
            value={itemType}
            onChange={event => onChange({ category, subcategory, itemType: event.target.value })}
            className={selectClass}
          >
            <option value="">No item type</option>
            {itemType && !child?.itemTypes?.some(value => value.id === itemType) && (
              <option value={itemType}>{itemType} (legacy)</option>
            )}
            {child?.itemTypes?.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryFields({
  category,
  subcategory,
  onChange,
  required = false,
  requireSubcategory = false,
  disabled = false,
}: CategoryFieldsProps) {
  return (
    <ListingCategoryFields
      category={category}
      subcategory={subcategory}
      itemType=""
      required={required}
      requireSubcategory={requireSubcategory}
      disabled={disabled}
      onChange={values => onChange(values.category, values.subcategory)}
    />
  );
}
