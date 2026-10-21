# PDF Editor

A React Native PDF editor built with Expo (SDK 57). Import a PDF, mark it up, sign it,
rearrange its pages, and save the result back as a real PDF. Everything runs on the
device with no server and no network connection.

## Features

- **Library**: import PDFs and Word documents (.docx) from Files, create blank PDFs, and
  rename, duplicate, share or delete documents.
- **Word documents**: edit text with bold, italic, underline, headings, lists and alignment,
  then save as .docx or as a PDF (which opens in the PDF editor).
- **Annotate**: pen, highlighter, text, box, circle, line, arrow and whiteout tools,
  plus an eraser. Each tool has its own color and size settings.
- **Edit the PDF's own text**: with the Edit text tool, tap highlighted text to change it.
  The new text keeps the original's position, size, color, bold and italic, in the closest
  standard font, over a cover box in the page's own background color. Fillable form fields
  can be tapped the same way, and their values use the field's own font.
- **Fill forms**: fill in text boxes, checkboxes, dropdowns and radio buttons in fillable PDFs.
  They stay fillable after saving, or you can lock them in place.
- **Zoom**: pinch or use the zoom buttons (50%–300%). Pages re-render sharply at each
  zoom level.
- **Edit annotations**: tap one to select it, drag to move it, use the corner handle to
  resize it, and edit, duplicate or delete it from the action bar. Undo and redo cover
  every change.
- **Sign**: draw a signature once, then reuse it from your saved signatures.
- **Images**: insert photos from your library.
- **Pages**: rotate, reorder, duplicate and delete pages, insert blank pages, and merge
  in another PDF.
- **Save**: write edits into the file, save them as a copy, or share the edited PDF.
  If you leave with unsaved changes, the app asks whether to save or discard them.

## Getting started

```bash
npm install        # also runs scripts/bundle-web-libs.js (see below)
npx expo start
```

Then open the app in **Expo Go**, an iOS simulator or an Android emulator. Every native
module it uses ships with Expo Go, so you don't need a development build. The app
targets iOS and Android. The web build is not supported, because rendering relies on a
native WebView.

Useful checks:

```bash
npx tsc --noEmit
npx expo lint
```

## How it works

```
src/
  app/
    index.tsx               Document library (home)
    editor/[id].tsx         Editor screen: state, toolbar, save/share, page manager
  components/editor/
    page-editor.tsx         One page: rendered image + annotation layer + gestures
    annotation-layer.tsx    Draws annotations with react-native-svg
    page-view.tsx           Rendered page image
    toolbar.tsx             Tool picker and tool options
    page-manager.tsx        Thumbnail grid for page operations
    signature-pad.tsx       Signature capture and saved signatures
  lib/
    documents.ts            PDF files in the app's document directory
    pdf-renderer/           pdf.js running in a hidden WebView
    editor/                 Document model, geometry, undo/redo history, tools
    pdf/export.ts           Flattens the editor state into a PDF with pdf-lib
    pdf/pages.ts            Blank pages, merging, new documents
```

- **Rendering.** [pdf.js](https://mozilla.github.io/pdf.js/) runs inside a hidden
  `react-native-webview` and rasterizes pages to JPEG on demand.
- **Word documents.** [mammoth](https://github.com/mwilliamson/mammoth.js) converts .docx
  to HTML inside a WebView, where it is edited. [docx](https://docx.js.org) rebuilds a .docx
  from the edited HTML, and `expo-print` turns it into a PDF.
- **Offline libraries.** pdf.js, mammoth and docx are inlined into git-ignored
  `*.generated.ts` modules by `scripts/bundle-web-libs.js` on `npm install`, so nothing is
  loaded from the network. If the files are missing, run `node scripts/bundle-web-libs.js`.
- **Editing model.** The editor never changes the original PDF while you work. Each
  editor page refers to a source page by index, and holds an extra rotation and a list
  of vector annotations. Annotation coordinates are in PDF points, in the page's base
  orientation, so they rotate along with the page. Blank pages and merged PDFs are
  *appended* to the source document, which keeps existing page indices valid.
- **Saving.** [pdf-lib](https://pdf-lib.js.org/) edits the source document in place, which
  keeps its fillable form. It arranges the pages in editor order with their rotation, then
  draws each annotation into the page content, mapping coordinates through the page's crop
  box and its own `/Rotate`. Form values are written into the source as soon as you apply
  them.

## Known limitations

- Saving **flattens** annotations into the page content. After you save, they can no
  longer be edited as separate objects.
- Text uses the standard Helvetica font. Characters outside Latin-1 are written as `?`
  in the saved PDF.
- Edit text works on text runs, which are often whole phrases or lines rather than
  single words. The cover box is white, and scanned PDFs have no text to edit.
- Form edits aren't part of undo/redo.
- Password-protected PDFs aren't supported.
- Word support keeps content and basic formatting (headings, bold/italic/underline, lists,
  tables, images, alignment), not exact Word layout: custom fonts, colors, text boxes,
  headers and footers are lost. Old .doc files aren't supported.
