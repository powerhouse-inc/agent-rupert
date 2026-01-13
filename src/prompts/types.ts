export interface PromptTask {
  id: string;
  title: string;
  content: string;
}

export interface PromptDocument {
  id: string;
  title: string;
  preamble?: string;
  tasks: PromptTask[];
}

export interface PromptCategory {
  name: string;
  documents: PromptDocument[];
}

export interface PromptMetadata {
  id: string;
  title: string;
  category: string;
  taskCount: number;
  filePath: string;
}