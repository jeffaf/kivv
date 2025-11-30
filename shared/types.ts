/**
 * Shared TypeScript types and interfaces for kivv
 */

export interface User {
  id: string;
  email: string;
  name: string;
  api_key: string;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  user_id: string;
  name: string;
  keywords: string[];
  categories: string[];
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: string;
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  published_date: string;
  pdf_url: string;
  created_at: string;
}

export interface Summary {
  id: string;
  paper_id: string;
  user_id: string;
  summary_text: string;
  key_insights: string[];
  relevance_score: number;
  model: string;
  tokens_used: number;
  created_at: string;
}

export interface UserPaper {
  user_id: string;
  paper_id: string;
  topic_id: string;
  status: 'new' | 'read' | 'archived';
  relevance_score: number;
  created_at: string;
}
