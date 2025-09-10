import React from 'react';
import { StoryCategory } from '../types';
import { Edit } from 'lucide-react';

interface CategoryCardProps {
  category: StoryCategory;
  onSelect: () => void;
  onEdit: () => void;
  isSelected: boolean;
  isDisabled: boolean;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onSelect,
  onEdit,
  isSelected,
  isDisabled
}) => {
  return (
    <div 
      className={`
        relative p-4 rounded-lg border transition-all
        ${isSelected 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-gray-200 bg-white hover:border-blue-300'
        }
        ${isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-medium text-gray-900">{category.name}</h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100"
          disabled={isDisabled}
          aria-label="Edit category"
        >
          <Edit size={16} />
        </button>
      </div>
      
      <div className="mt-1 text-sm text-gray-600">{category.description}</div>
      
      <div className="mt-4">
        <button
          onClick={onSelect}
          disabled={isDisabled}
          className={`
            w-full py-1.5 px-3 text-sm rounded-md transition-colors
            ${isSelected
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }
            ${isDisabled ? 'cursor-not-allowed' : ''}
          `}
        >
          {isSelected ? 'Selected' : 'Generate Story'}
        </button>
      </div>
    </div>
  );
};

export default CategoryCard;
