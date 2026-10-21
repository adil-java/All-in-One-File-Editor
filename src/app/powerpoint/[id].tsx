import { useLocalSearchParams } from 'expo-router';

import {
  type OfficeEditorConfig,
  OfficeEditorScreen,
} from '@/components/office/office-editor-screen';
import { POWERPOINT_EDITOR_HTML, printableSlidesHtml } from '@/lib/powerpoint/editor-html';

/** One PDF page per slide, at the presentation's own slide size. */
const POWERPOINT: OfficeEditorConfig = {
  kind: 'pptx',
  html: POWERPOINT_EDITOR_HTML,
  exportFunction: '__toPptx',
  print: (message) => {
    const widthPt = Number(message.widthPt);
    const ratio = Number(message.ratio);
    return {
      html: printableSlidesHtml(message.html, widthPt, ratio),
      width: Math.round(widthPt),
      height: Math.round(widthPt * ratio),
    };
  },
};

export default function PowerPointEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OfficeEditorScreen id={id} config={POWERPOINT} />;
}
