import { useState, useEffect, useCallback } from 'react';
import { StoryCategory } from '../types';

// Initial categories for development
const initialCategories: StoryCategory[] = [
  {
    id: '1',
    name: 'Fantasy Adventure',
    description: 'Epic quests in magical worlds',
    prompt: 'Write a fantasy adventure story with knights, dragons, and magic.'
  },
  {
    id: '2',
    name: 'Sci-Fi Exploration',
    description: 'Journeys through space and time',
    prompt: 'Write a science fiction story about exploring a newly discovered planet.'
  },
  {
    id: '3',
    name: 'Mystery',
    description: 'Puzzling cases and clever detectives',
    prompt: 'Write a mystery story with an unexpected twist at the end.'
  },
  {
    id: '4',
    name: 'Romance',
    description: 'Tales of love and connection',
    prompt: 'Write a heartwarming romance story set in a small coastal town.'
  }
];

export const useCategories = () => {
  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load categories from localStorage or use initial ones
  useEffect(() => {
    try {
      const savedCategories = localStorage.getItem('storyCategories');
      if (savedCategories) {
        setCategories(JSON.parse(savedCategories));
      } else {
        setCategories(initialCategories);
        localStorage.setItem('storyCategories', JSON.stringify(initialCategories));
      }
    } catch (e) {
      console.error('Failed to load categories:', e);
      setCategories(initialCategories);
    } finally {
      setIsLoading(false);
    }
    
    // No cleanup function needed here
  }, []);
  
  // Save categories to localStorage when they change
  useEffect(() => {
    if (categories.length > 0 && !isLoading) {
      localStorage.setItem('storyCategories', JSON.stringify(categories));
    }
    
    // No cleanup function needed here
  }, [categories, isLoading]);
  
  // Update a category
  const updateCategory = useCallback((updatedCategory: StoryCategory) => {
    setCategories(prev => 
      prev.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat)
    );
  }, []);
  
  // Add a new category
  const addCategory = useCallback((newCategory: StoryCategory) => {
    setCategories(prev => [...prev, newCategory]);
  }, []);
  
  // Delete a category
  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== id));
  }, []);
  
  return {
    categories,
    isLoading,
    updateCategory,
    addCategory,
    deleteCategory
  };
};
