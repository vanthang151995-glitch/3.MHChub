export type DocumentTitleRecord = {
  fileName?: string | null;
  originalName?: string | null;
  title?: string | null;
  titleI18n?: Record<string, string | null | undefined> | null;
};

export type NormalizeDocumentTitleInput = {
  fallback?: string;
  fileName?: string;
  originalName?: string;
  title?: string;
};

export function getDocumentDisplayTitle(document?: DocumentTitleRecord | null, fallback?: string, lang?: string): string;
export function isPlaceholderDocumentTitle(title?: string | null): boolean;
export function normalizeDocumentTitleForStorage(input?: NormalizeDocumentTitleInput): string;
export function titleFromFileName(fileName?: string | null): string;
