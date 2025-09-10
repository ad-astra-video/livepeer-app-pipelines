import React from 'react';
import { StoryCategory } from '../types';
import CategoryCard from './CategoryCard';

interface CategoryGridProps {
  categories: StoryCategory[];
  onSelectCategory: (category: StoryCategory) => void;
  onEditCategory: (category: StoryCategory) => void;
  selectedCategory: StoryCategory | null;
  isGenerating: boolean;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  categories,
  onSelectCategory,
  onEditCategory,
  selectedCategory,
  isGenerating
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
      {categories.map(category => (
        <CategoryCard
          key={category.id}
          category={category}
          onSelect={() => onSelectCategory(category)}
          onEdit={() => onEditCategory(category)}
          isSelected={selectedCategory?.id === category.id}
          isDisabled={isGenerating}
        />
      ))}
      
      {categories.length === 0 && (
        <div className="col-span-full p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <p className="text-gray-500">No categories yet. Add one to get started!</p>
        </div>
      )}
    </div>
  );
};

export default CategoryGrid;
