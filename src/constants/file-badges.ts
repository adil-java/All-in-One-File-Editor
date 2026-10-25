import type { DocumentKind } from '@/lib/documents';

/** File icon label and color per document kind. */
export const FILE_BADGES: Record<DocumentKind, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: '#E5383B' },
  docx: { label: 'DOC', color: '#2B579A' },
  xlsx: { label: 'XLS', color: '#1D7A45' },
  pptx: { label: 'PPT', color: '#D35230' },
};
