export type ItemType =
  | 'link'
  | 'article'
  | 'video'
  | 'recipe'
  | 'workout'
  | 'note'
  | 'place'
  | 'product'
  | 'book'
  | 'movie'
  | 'music'
  | 'game'
  | 'image';

export const ITEM_TYPES: readonly ItemType[] = [
  'link',
  'article',
  'video',
  'recipe',
  'workout',
  'note',
  'place',
  'product',
  'book',
  'movie',
  'music',
  'game',
  'image',
];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  link: 'Link',
  article: 'Article',
  video: 'Video',
  recipe: 'Recipe',
  workout: 'Workout',
  note: 'Note',
  place: 'Place',
  product: 'Product',
  book: 'Book',
  movie: 'Movie',
  music: 'Music',
  game: 'Game',
  image: 'Image',
};

export type AiStatus = 'none' | 'processing' | 'done' | 'error';

export interface Tag {
  id: string;
  name: string;
}

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isSmart: boolean;
  smartRule: string | null;
  itemCount: number;
  createdAt: string;
}

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  url: string | null;
  source: string | null;
  description: string | null;
  textContent: string | null;
  extracted: Record<string, unknown> | null;
  thumbnailUrl: string | null;
  provider: string | null;
  model: string | null;
  aiStatus: AiStatus;
  aiError: string | null;
  starred: boolean;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
  collections: string[];
}

export interface ItemInput {
  url?: string | null;
  text?: string | null;
  title?: string | null;
  type?: ItemType | null;
  collectionIds?: string[];
  tagNames?: string[];
  enrich?: boolean;
  matchCollections?: boolean;
}

export interface SmartRule {
  matchType?: ItemType;
}

export interface CollectionInput {
  name: string;
  emoji?: string;
  color?: string;
  isSmart?: boolean;
  smartRule?: SmartRule | null;
}

export interface ItemUpdate {
  title?: string | null;
  type?: ItemType | null;
  description?: string | null;
  url?: string | null;
  textContent?: string | null;
  starred?: boolean | null;
  done?: boolean | null;
  collectionIds?: string[] | null;
  tagNames?: string[] | null;
}

export interface AiPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  note?: string;
}

export interface AiFeatureSettings {
  summarize: boolean;
  categorize: boolean;
  extractRecipe: boolean;
  extractWorkout: boolean;
}

/** Client-facing AI settings. `apiKey` is write-only (cleared on read). */
export interface AiSettings {
  preset: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  features: AiFeatureSettings;
  featureModels: Partial<Record<AiFeatureKey, string>>;
}

export type AiFeatureKey = 'summarize' | 'categorize' | 'extractRecipe' | 'extractWorkout';

export const AI_FEATURES: readonly AiFeatureKey[] = [
  'summarize',
  'categorize',
  'extractRecipe',
  'extractWorkout',
];

export interface AiSettingsView extends Omit<AiSettings, 'apiKey'> {
  apiKeyConfigured: boolean;
}

export interface AiLog {
  id: string;
  feature: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface Stats {
  total: number;
  unconsumed: number;
  done: number;
  starred: number;
  byType: Record<string, number>;
  consumedRatio: number;
}

export interface MetaSeo {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

export interface DecidedItem {
  item: Item | null;
  poolSize: number;
}

export interface ExportPayload {
  app: string;
  version: string;
  exportedAt: string;
  items: Item[];
  collections: Omit<Collection, 'itemCount'>[];
}