import { StoryCategory } from '../types';

export const defaultCategories: Omit<StoryCategory, 'id'>[] = [
  {
    name: 'Science Fiction',
    description: 'Futuristic tales of technology and space',
    prompt: 'Create a science fiction story set in the distant future. Include advanced technology, space travel, and exploration of the unknown. Consider themes of humanity\'s relationship with technology.'
  },
	{
    name: 'Fantasy Adventure',
    description: 'Epic quests in magical worlds',
    prompt: 'Write a fantasy adventure story with magic, heroes, and an epic quest to save the realm. Include mythical creatures, magical artifacts, and unexpected plot twists.'
  },  
  {
    name: 'Mystery',
    description: 'Puzzling cases and clever detectives',
    prompt: 'Write a mystery story with an intriguing crime, clever detective, and multiple suspects. Include red herrings, clues, and a surprising but logical resolution.'
  },
  {
    name: 'Historical Fiction',
    description: 'Stories set in fascinating past eras',
    prompt: 'Create a historical fiction story set in a specific time period. Include accurate historical details, cultural context, and characters facing the challenges of their era.'
  },
  {
    name: 'Comedy',
    description: 'Humorous tales to make readers laugh',
    prompt: 'Write a comedic story with funny situations, witty dialogue, and humorous characters. Include misunderstandings, unexpected twists, and a satisfying resolution.'
  },
  {
    name: 'Romance',
    description: 'Tales of love and relationships',
    prompt: 'Create a romantic story with compelling characters who overcome obstacles to find love. Include emotional depth, authentic relationship development, and a satisfying conclusion.'
  }
];
