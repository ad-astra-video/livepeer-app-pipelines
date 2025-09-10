import React from 'react';
import { Edit } from 'lucide-react';
import { StoryCategory } from '../types';

interface CategoryRowProps {
  category: StoryCategory;
  onSelect: () => void;
  onEdit: () => void;
  isSelected: boolean;
  isDisabled: boolean;
  isCollapsed: boolean;
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  category,
  onSelect,
  onEdit,
  isSelected,
  isDisabled,
  isCollapsed
}) => {
  // For collapsed view, use first letter of category name as icon
  const categoryInitial = category.name.charAt(0).toUpperCase();

  if (isCollapsed) {
    return (
      <div 
        className={`
          flex justify-center items-center w-10 h-10 mx-auto rounded-md cursor-pointer transition-all
          ${isSelected 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
          ${isDisabled ? 'opacity-60 pointer-events-none' : ''}
        `}
        onClick={onSelect}
        title={category.name}
      >
        {categoryInitial}
      </div>
    );
  }

  return (
    <div 
      className={`
        relative flex items-center border rounded-lg p-3 cursor-pointer transition-all
        ${isSelected 
          ? 'border-blue-500 bg-blue-50 shadow-sm' 
          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'}
        ${isDisabled ? 'opacity-60 pointer-events-none' : ''}
      `}
      onClick={onSelect}
    >
      <div className="flex-grow mr-2">
        <h3 className="font-medium text-gray-800 truncate">{category.name}</h3>
      </div>
      
      <div className="flex items-center space-x-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
          disabled={isDisabled}
          aria-label="Edit category"
        >
          <Edit size={16} />
        </button>
      </div>
    </div>
  );
};

export default CategoryRow;
