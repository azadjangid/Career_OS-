// Shared TypeScript types

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  yearsOfExp?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  salaryMin?: number;
  salaryMax?: number;
  noticePeriod?: string;
  skills?: Skill[];
}

export interface Skill {
  id: string;
  name: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  isPrimary: boolean;
}

export interface Job {
  id: string;
  title: string;
  companyName: string;
  description?: string;
  location?: string;
  workMode?: string;
  jobType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applyUrl?: string;
  postedAt?: string;
  skills?: string[];
}

export interface Application {
  id: string;
  status: string;
  appliedAt?: string;
  updatedAt: string;
  notes?: string;
  job: Pick<Job, 'id' | 'title' | 'companyName'>;
  resume?: { id: string; name: string };
}

export interface Resume {
  id: string;
  name: string;
  fileName?: string;
  fileSize?: number;
  isDefault: boolean;
  atsScore?: number;
  createdAt: string;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  updatedAt: string;
}
