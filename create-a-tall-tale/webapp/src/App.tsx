import React, { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { StoryCategory, Settings } from './types';
import { useSSE } from './hooks/api';
import CategoryGrid from './components/CategoryGrid';
import StoryDisplay from './components/StoryDisplay';
import CategoryForm from './components/CategoryForm';
import SettingsModal from './components/SettingsModal';

// Default categories
const defaultCategories: StoryCategory[] = [
  {
    id: '1',
    name: 'Fantasy Adventure',
    description: 'Epic quests in magical worlds',
    prompt: 'Write a fantasy adventure story with a hero, magic, and an epic quest.'
  },
  {
    id: '2',
    name: 'Sci-Fi Exploration',
    description: 'Journeys through space and time',
    prompt: 'Create a science fiction story about space exploration and discovering a new civilization.'
  },
  {
    id: '3',
    name: 'Mystery',
    description: 'Puzzling cases and clever detectives',
    prompt: 'Write a mystery story with a detective solving a complex case with unexpected twists.'
  }
];

const App: React.FC = () => {
  // State for categories
  const [categories, setCategories] = useState<StoryCategory[]>(defaultCategories);
  const [selectedCategory, setSelectedCategory] = useState<StoryCategory | null>(null);
  const [editingCategory, setEditingCategory] = useState<StoryCategory | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    apiBaseUrl: 'http://localhost:8088/gateway'  // Default value
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // API base URL - replace with your actual API URL
  const apiBaseUrl = 'http://localhost:8088/gateway'; // or window.location.origin for same-origin API
  
  // Story generation state
  const { messages, isLoading, error, getStoryPrompt, currentPrompt } = useSSE(settings.apiBaseUrl);
  
  // Ref for story container
  const storyContainerRef = useRef<HTMLDivElement>(null);
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('app-settings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse saved settings');
      }
    }
  }, []);

  // Handle category selection
  const handleSelectCategory = (category: StoryCategory) => {
    setSelectedCategory(category);
    // Generate story when a category is selected
    getStoryPrompt(category.prompt);
  };
  
  // Handle category edit
  const handleEditCategory = (category: StoryCategory) => {
    setEditingCategory(category);
    setIsFormOpen(true);
  };
  
  // Handle category add
  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };
  
  // Handle form submission
  const handleFormSubmit = (category: StoryCategory) => {
    if (editingCategory) {
      // Update existing category
      setCategories(categories.map(c => c.id === category.id ? category : c));
    } else {
      // Add new category
      const newCategory = {
        ...category,
        id: Date.now().toString() // Simple ID generation
      };
      setCategories([...categories, newCategory]);
    }
    setIsFormOpen(false);
  };
  
  // Handle settings save
  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem('app-settings', JSON.stringify(newSettings));
    setIsSettingsOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Create a Tall Tale</h1>
            <p className="text-gray-500 mt-1">Generate creative stories with AI</p>
          </div>
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Settings"
          >
            <SettingsIcon className="h-6 w-6 text-gray-700" />
          </button>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Categories</h2>
              <button
                onClick={handleAddCategory}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Add New
              </button>
            </div>
            
            <CategoryGrid
              categories={categories}
              onSelectCategory={handleSelectCategory}
              onEditCategory={handleEditCategory}
              selectedCategory={selectedCategory}
              isGenerating={isLoading}
            />
          </div>
          
          <div className="lg:col-span-2 flex flex-col h-full">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Generated Story</h2>
            <StoryDisplay
              messages={messages}
              isLoading={isLoading}
              error={error}
              currentPrompt={currentPrompt}
              containerRef={storyContainerRef}
            />
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {isFormOpen && (
        <CategoryForm
          category={editingCategory}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsFormOpen(false)}
        />
      )}
      
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default App;
