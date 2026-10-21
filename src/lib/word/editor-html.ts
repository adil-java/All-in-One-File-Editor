import { DOCX_LIB, MAMMOTH_LIB } from './word-source.generated';

/**
 * Page that edits Word documents inside a WebView.
 *
 * React Native drives it via `injectJavaScript`:
 *   window.__open(base64)        load a .docx (converted to HTML by mammoth)
 *   window.__getHtml(requestId)  current document HTML (for printing to PDF)
 *   window.__toDocx(requestId)   current document as a .docx (base64), built with `docx`
 * and receives messages through `ReactNativeWebView.postMessage`:
 *   ready, opened, open-error, changed, html, docx, error.
 *
 * The formatting toolbar lives in the page itself so taps don't steal the
 * text selection from the editable area.
 */
const BRIDGE = String.raw`
(function () {
  var editor = document.getElementById('editor');
  var changeReported = false;

  function post(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  function errorMessage(error) {
    return String((error && error.message) || error);
  }

  function decodeBase64(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---- Toolbar ---------------------------------------------------------

  document.execCommand('styleWithCSS', false, false);

  function updateToolbar() {
    document.querySelectorAll('[data-state]').forEach(function (button) {
      var active = false;
      try {
        active = document.queryCommandState(button.dataset.state);
      } catch (e) {}
      button.classList.toggle('active', active);
    });
    var block = (document.queryCommandValue('formatBlock') || 'p').toLowerCase();
    document.getElementById('block').value = /^h[1-3]$/.test(block) ? block : 'p';
  }

  document.querySelectorAll('[data-cmd]').forEach(function (button) {
    // mousedown + preventDefault keeps the selection in the editor.
    button.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    button.addEventListener('click', function () {
      document.execCommand(button.dataset.cmd, false, button.dataset.value || null);
      editor.focus();
      updateToolbar();
      onChange();
    });
  });

  document.getElementById('block').addEventListener('change', function (e) {
    editor.focus();
    document.execCommand('formatBlock', false, '<' + e.target.value + '>');
    onChange();
  });

  document.addEventListener('selectionchange', updateToolbar);

  function onChange() {
    if (changeReported) return;
    changeReported = true;
    post({ type: 'changed' });
  }
  editor.addEventListener('input', onChange);

  // ---- Open ------------------------------------------------------------

  window.__open = function (base64) {
    mammoth
      .convertToHtml(
        { arrayBuffer: decodeBase64(base64).buffer },
        // mammoth drops underline by default; keep it.
        { styleMap: ['u => u'] },
      )
      .then(function (result) {
        editor.innerHTML = result.value || '<p><br></p>';
        changeReported = false;
        post({ type: 'opened', warnings: result.messages.length });
      })
      .catch(function (error) {
        post({ type: 'open-error', message: errorMessage(error) });
      });
  };

  window.__getHtml = function (requestId) {
    post({ type: 'html', requestId: requestId, html: editor.innerHTML });
  };

  // ---- HTML -> .docx -----------------------------------------------------

  var D = window.docx;
  var HEADINGS = {
    h1: D.HeadingLevel.HEADING_1,
    h2: D.HeadingLevel.HEADING_2,
    h3: D.HeadingLevel.HEADING_3,
    h4: D.HeadingLevel.HEADING_4,
    h5: D.HeadingLevel.HEADING_5,
    h6: D.HeadingLevel.HEADING_6,
  };
  var ALIGNMENT = {
    center: D.AlignmentType.CENTER,
    right: D.AlignmentType.RIGHT,
    justify: D.AlignmentType.JUSTIFIED,
  };
  var BLOCKS = /^(p|div|h[1-6]|ul|ol|li|table|blockquote|hr|pre)$/;
  var MAX_IMAGE_WIDTH = 600;
  var listCount = 0;

  function imageRun(img) {
    var match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.*)$/i.exec(img.getAttribute('src') || '');
    if (!match) return null;
    var width = img.naturalWidth || img.width || 200;
    var height = img.naturalHeight || img.height || 200;
    if (width > MAX_IMAGE_WIDTH) {
      height = Math.round((height * MAX_IMAGE_WIDTH) / width);
      width = MAX_IMAGE_WIDTH;
    }
    var type = match[1].toLowerCase().replace('jpeg', 'jpg');
    return new D.ImageRun({
      type: type,
      data: decodeBase64(match[2]),
      transformation: { width: width, height: height },
    });
  }

  // Inline content of a node as docx runs, inheriting character formatting.
  function runs(node, style) {
    var out = [];
    node.childNodes.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        var text = child.textContent.replace(/\s+/g, ' ');
        if (!text) return;
        out.push(
          new D.TextRun({
            text: text,
            bold: style.bold,
            italics: style.italics,
            underline: style.underline ? {} : undefined,
            strike: style.strike,
            superScript: style.superScript,
            subScript: style.subScript,
            style: style.link ? 'Hyperlink' : undefined,
          }),
        );
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      var tag = child.tagName.toLowerCase();
      if (tag === 'br') return out.push(new D.TextRun({ text: '', break: 1 }));
      if (tag === 'img') {
        var image = imageRun(child);
        if (image) out.push(image);
        return;
      }
      if (BLOCKS.test(tag)) return; // handled by blocks()
      var next = Object.assign({}, style);
      if (tag === 'b' || tag === 'strong') next.bold = true;
      if (tag === 'i' || tag === 'em') next.italics = true;
      if (tag === 'u') next.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true;
      if (tag === 'sup') next.superScript = true;
      if (tag === 'sub') next.subScript = true;
      if (tag === 'a' && child.getAttribute('href')) {
        next.link = true;
        out.push(
          new D.ExternalHyperlink({ link: child.getAttribute('href'), children: runs(child, next) }),
        );
        return;
      }
      out = out.concat(runs(child, next));
    });
    return out;
  }

  function paragraph(node, options) {
    var align = ALIGNMENT[(node.style && node.style.textAlign) || node.getAttribute('align')];
    return new D.Paragraph(
      Object.assign({ children: runs(node, {}), alignment: align }, options || {}),
    );
  }

  function listItems(list, level, out) {
    var ordered = list.tagName.toLowerCase() === 'ol';
    var instance = ++listCount;
    Array.prototype.forEach.call(list.children, function (li) {
      if (li.tagName.toLowerCase() !== 'li') return;
      out.push(
        paragraph(
          li,
          ordered
            ? { numbering: { reference: 'numbered', level: level, instance: instance } }
            : { bullet: { level: level } },
        ),
      );
      Array.prototype.forEach.call(li.children, function (child) {
        if (/^(ul|ol)$/i.test(child.tagName)) listItems(child, Math.min(level + 1, 8), out);
      });
    });
  }

  function table(node) {
    var rows = Array.prototype.slice.call(node.querySelectorAll('tr')).filter(function (tr) {
      return tr.closest('table') === node;
    });
    return new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      rows: rows.map(function (tr) {
        return new D.TableRow({
          children: Array.prototype.map.call(tr.children, function (cell) {
            var content = blocks(cell);
            return new D.TableCell({
              children: content.length ? content : [new D.Paragraph('')],
              columnSpan: cell.colSpan > 1 ? cell.colSpan : undefined,
            });
          }),
        });
      }),
    });
  }

  // Block-level content of a container as docx paragraphs and tables.
  function blocks(container) {
    var out = [];
    var inline = null; // collects loose inline nodes into one paragraph
    function flushInline() {
      if (inline && inline.textContent.trim()) out.push(paragraph(inline));
      inline = null;
    }
    container.childNodes.forEach(function (child) {
      var tag = child.nodeType === Node.ELEMENT_NODE ? child.tagName.toLowerCase() : null;
      if (!tag || !BLOCKS.test(tag)) {
        inline = inline || document.createElement('span');
        inline.appendChild(child.cloneNode(true));
        return;
      }
      flushInline();
      if (HEADINGS[tag]) out.push(paragraph(child, { heading: HEADINGS[tag] }));
      else if (tag === 'ul' || tag === 'ol') listItems(child, 0, out);
      else if (tag === 'table') out.push(table(child));
      else if (tag === 'hr') out.push(new D.Paragraph({ thematicBreak: true }));
      else if (tag === 'blockquote') out.push(paragraph(child, { indent: { left: 720 } }));
      else if (tag === 'div' && Array.prototype.some.call(child.children, function (c) {
        return BLOCKS.test(c.tagName.toLowerCase());
      })) out = out.concat(blocks(child));
      else out.push(paragraph(child));
    });
    flushInline();
    return out;
  }

  function numberingLevels() {
    var formats = [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN];
    var levels = [];
    for (var level = 0; level < 9; level++) {
      levels.push({
        level: level,
        format: formats[level % 3],
        text: '%' + (level + 1) + '.',
        alignment: D.AlignmentType.START,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      });
    }
    return levels;
  }

  window.__toDocx = function (requestId) {
    try {
      listCount = 0;
      var children = blocks(editor);
      var doc = new D.Document({
        numbering: { config: [{ reference: 'numbered', levels: numberingLevels() }] },
        sections: [{ children: children.length ? children : [new D.Paragraph('')] }],
      });
      D.Packer.toBase64String(doc)
        .then(function (base64) {
          changeReported = false;
          post({ type: 'docx', requestId: requestId, base64: base64 });
        })
        .catch(function (error) {
          post({ type: 'error', requestId: requestId, message: errorMessage(error) });
        });
    } catch (error) {
      post({ type: 'error', requestId: requestId, message: errorMessage(error) });
    }
  };

  post({ type: 'ready' });
})();
`;

/** Styles shared by the editor and the printed PDF, so both look the same. */
export const DOCUMENT_CSS = `
  body { font-family: Calibri, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11pt;
    line-height: 1.4; color: #111; }
  h1 { font-size: 20pt; margin: 0.6em 0 0.3em; }
  h2 { font-size: 16pt; margin: 0.6em 0 0.3em; }
  h3 { font-size: 13pt; margin: 0.6em 0 0.3em; }
  p { margin: 0 0 0.6em; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  td, th { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  blockquote { margin: 0.6em 0 0.6em 1.5em; color: #444; }
`;

export const WORD_EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  ${DOCUMENT_CSS}
  html, body { margin: 0; background: #e4e6eb; }
  #toolbar { position: sticky; top: 0; z-index: 1; display: flex; gap: 4px; align-items: center;
    overflow-x: auto; padding: 6px 8px; background: #fff; border-bottom: 1px solid #dfe1e6;
    -webkit-user-select: none; user-select: none; }
  #toolbar button, #toolbar select { flex: none; min-width: 36px; height: 34px; border: 1px solid #dfe1e6;
    border-radius: 8px; background: #fff; color: #111; font-size: 15px; padding: 0 8px; }
  #toolbar button.active { background: #ffe3e3; border-color: #e5383b; color: #e5383b; }
  #page { background: #fff; margin: 12px; padding: 24px 20px; min-height: 80vh;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
  #editor { outline: none; min-height: 70vh; }
</style>
</head>
<body>
<div id="toolbar">
  <select id="block"><option value="p">Text</option><option value="h1">Heading 1</option>
    <option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
  <button data-cmd="bold" data-state="bold"><b>B</b></button>
  <button data-cmd="italic" data-state="italic"><i>I</i></button>
  <button data-cmd="underline" data-state="underline"><u>U</u></button>
  <button data-cmd="strikeThrough" data-state="strikeThrough"><s>S</s></button>
  <button data-cmd="insertUnorderedList" data-state="insertUnorderedList">&bull; List</button>
  <button data-cmd="insertOrderedList" data-state="insertOrderedList">1. List</button>
  <button data-cmd="justifyLeft" data-state="justifyLeft">&#8676;</button>
  <button data-cmd="justifyCenter" data-state="justifyCenter">&#8596;</button>
  <button data-cmd="justifyRight" data-state="justifyRight">&#8677;</button>
  <button data-cmd="undo">&#8630;</button>
  <button data-cmd="redo">&#8631;</button>
</div>
<div id="page"><div id="editor" contenteditable="true"><p><br></p></div></div>
<script>${MAMMOTH_LIB}</script>
<script>${DOCX_LIB}</script>
<script>${BRIDGE}</script>
</body>
</html>`;

/** Standalone HTML for printing the document to PDF (A4). */
export function printableHtml(bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 20mm 18mm; }
  html, body { margin: 0; }
  ${DOCUMENT_CSS}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
