export interface StoryCategory {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface StreamMessage {
  id: string;
  content: string;
}

export interface Settings {
  apiBaseUrl: string;
}
