export interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
  column: number;
}
export interface GrepOptions {
  pattern: string;
  paths: string[];
  glob?: string;
  maxCount?: number;
  caseSensitive?: boolean;
  followLinks?: boolean;
  includeHidden?: boolean;
  maxDepth?: number;
}
export function grep(opts: GrepOptions): GrepMatch[];

export interface GlobOptions {
  pattern: string;
  root: string;
  followLinks?: boolean;
  includeHidden?: boolean;
  maxDepth?: number;
}
export function glob(opts: GlobOptions): string[];

export interface SearchEntry {
  path: string;
  fileType: string;
  size: number;
  modified: number;
}
export interface SearchOptions {
  paths: string[];
  namePattern?: string;
  fileType?: string;
  maxDepth?: number;
  minSize?: number;
  maxSize?: number;
  followLinks?: boolean;
  includeHidden?: boolean;
}
export function searchFiles(opts: SearchOptions): SearchEntry[];
