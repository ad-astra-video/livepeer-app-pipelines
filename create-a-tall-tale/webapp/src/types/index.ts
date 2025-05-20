export interface Settings {
  apiBaseUrl: string;
}

export interface StreamMessage {
  id?: string;
  content: string;
  done?: boolean;
}

export interface StoryCategory {
  id: string;
  name: string;
  description: string;
  prompt: string;
}
