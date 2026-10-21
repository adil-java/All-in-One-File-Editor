import { useLocalSearchParams } from 'expo-router';

import {
  type OfficeEditorConfig,
  OfficeEditorScreen,
} from '@/components/office/office-editor-screen';
import { printableHtml, WORD_EDITOR_HTML } from '@/lib/word/editor-html';

/** A4 portrait in points, matching the @page size of the printable HTML. */
const WORD: OfficeEditorConfig = {
  kind: 'docx',
  html: WORD_EDITOR_HTML,
  exportFunction: '__toDocx',
  print: (message) => ({ html: printableHtml(message.html), width: 595, height: 842 }),
};

export default function WordEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OfficeEditorScreen id={id} config={WORD} />;
}
