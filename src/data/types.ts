export interface Poet {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
}

export interface Category {
  id: number;
  text: string;
  parentId: number;
  poetId: number;
  randomSelected: boolean;
}

export interface CategoryWithPoemCount extends Category {
  poemCount: number;
}

export interface Poem {
  id: number;
  title: string;
  categoryId: number;
}

export interface Verse {
  id: number;
  text: string;
  verseOrder: number;
  position: number;
  poemId: number;
}

export interface Highlight {
  id: number;
  verseId: number;
  startIndex: number;
  /** Exclusive. */
  endIndex: number;
  createdAt: number;
  color: string;
  groupId: string;
}

export interface VerseWithHighlights {
  verse: Verse;
  highlights: Highlight[];
}

/** A poem located in its poet/category hierarchy (Android: VersePoemCategoriesPoet). */
export interface PoemPath {
  poem: Poem;
  poet: Poet;
  /** Root first. */
  categories: Category[];
  verse?: Verse | null;
}

export interface PoemWithFirstVerse {
  poem: Poem;
  firstVerse: Verse | null;
}

export type LabelType = 'bookmark' | 'highlight';

export interface Label {
  id: number;
  name: string;
  color: string;
  type: LabelType;
  createdAt: number;
}

export interface LabelWithCount extends Label {
  itemCount: number;
}

export interface Comment {
  id: number;
  poemId: number;
  text: string;
  createdAt: number;
}

export interface SearchHistoryRecord {
  id: number;
  query: string;
  timestamp: number;
}

export const CATEGORY_COLOR_PALETTE = [
  '#bad982', '#cce595', '#9acc3d', '#718053', '#cc3d3d', '#cccccc',
  '#ccb23d', '#cc7a3d', '#3dbdab', '#3d7fcc', '#8a3dcc', '#cc3d8a',
];

export const HIGHLIGHT_COLORS = {
  green: '#8FBF6B',
  yellow: '#E8D06A',
  blue: '#7FA8D9',
  pink: '#E38FA8',
  purple: '#B08FD9',
} as const;

export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS.green;
