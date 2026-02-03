// Common utility types

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

// For async state management
export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

// For form handling
export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
}

// Sorting
export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T> {
  key: keyof T;
  direction: SortDirection;
}

// Pagination
export interface PaginationConfig {
  page: number;
  pageSize: number;
}

export interface PaginationState extends PaginationConfig {
  totalItems: number;
  totalPages: number;
}

// Component props helpers
export type PropsWithClassName<T = unknown> = T & {
  className?: string;
};

export type PropsWithChildren<T = unknown> = T & {
  children: React.ReactNode;
};

// Date utilities
export type DateString = string; // ISO 8601 format
export type Timestamp = number; // Unix timestamp in milliseconds
