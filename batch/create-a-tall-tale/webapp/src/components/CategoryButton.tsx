import React from 'react';
import { StoryCategory } from '../types';

interface CategoryButtonProps {
  category: StoryCategory;
  onClick: (category: StoryCategory) => void;
  onEdit: (category: StoryCategory) => void;
  isActive: boolean;
  disabled: boolean;
}

const CategoryButton: React.FC<CategoryButtonProps> = ({ 
  category, 
  onClick, 
  onEdit, 
  isActive,
  disabled 
}) => {
  return (
    <div className={`
      relative group border rounded-lg p-4 transition-all
      ${isActive 
        ? 'border-blue-500 bg-blue-50' 
        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    `}>
      <div 
        className="mb-2"
        onClick={() => !disabled && onClick(category)}
      >
        <h3 className="font-medium text-gray-900">{category.name}</h3>
        <p className="text-sm text-gray-500">{category.description}</p>
      </div>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit(category);
        }}
        disabled={disabled}
        className={`
          absolute top-2 right-2 p-1 rounded-full
          opacity-0 group-hover:opacity-100 transition-opacity
          ${disabled ? 'cursor-not-allowed' : 'hover:bg-gray-200'}
        `}
        aria-label="Edit category"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          <path d="m15 5 4 4"></path>
        </svg>
      </button>
    </div>
  );
};

export default CategoryButton;
