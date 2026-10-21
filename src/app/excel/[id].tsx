import { useLocalSearchParams } from 'expo-router';

import {
  type OfficeEditorConfig,
  OfficeEditorScreen,
} from '@/components/office/office-editor-screen';
import { EXCEL_EDITOR_HTML, printableSheetsHtml } from '@/lib/excel/editor-html';

/** A4 landscape in points, matching the @page size of the printable HTML. */
const EXCEL: OfficeEditorConfig = {
  kind: 'xlsx',
  html: EXCEL_EDITOR_HTML,
  exportFunction: '__toXlsx',
  print: (message) => ({ html: printableSheetsHtml(message.html), width: 842, height: 595 }),
};

export default function ExcelEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OfficeEditorScreen id={id} config={EXCEL} />;
}
