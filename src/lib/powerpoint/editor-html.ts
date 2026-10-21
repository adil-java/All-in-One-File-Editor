import { JSZIP_LIB } from '@/lib/office/office-source.generated';

/**
 * Page that edits the text of PowerPoint presentations (.pptx) in a WebView.
 *
 * Slides are drawn approximately (text boxes, pictures, tables and solid
 * backgrounds at their real positions), and every paragraph is editable. On
 * save only the paragraphs that were changed are rewritten in the slide XML,
 * so the rest of the presentation - themes, layouts, animations, media - is
 * kept exactly as it was.
 *
 * React Native drives it via `injectJavaScript`:
 *   window.__open(base64)          load a presentation
 *   window.__toPptx(requestId)     current presentation as .pptx (base64)
 *   window.__getHtml(requestId)    printable HTML of the slides (for PDF)
 * and receives: ready, opened, open-error, changed, pptx, html, error.
 */
const BRIDGE = String.raw`
(function () {
  var P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var EMU_PER_PT = 12700;

  var zip = null;
  var slides = []; // { path, doc, edits: Map(paragraph element -> text) }
  var size = { cx: 9144000, cy: 6858000 };
  var changeReported = false;
  var container = document.getElementById('slides');

  function post(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function errorMessage(error) {
    return String((error && error.message) || error);
  }
  function changed() {
    if (changeReported) return;
    changeReported = true;
    post({ type: 'changed' });
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- Package helpers ------------------------------------------------

  async function xml(path) {
    var file = zip.file(path);
    if (!file) return null;
    return new DOMParser().parseFromString(await file.async('string'), 'application/xml');
  }

  function resolve(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = base.split('/');
    parts.pop();
    target.split('/').forEach(function (p) {
      if (p === '..') parts.pop();
      else if (p !== '.') parts.push(p);
    });
    return parts.join('/');
  }

  /** Relationship id -> package path for a part. */
  async function rels(path) {
    var parts = path.split('/');
    var name = parts.pop();
    var doc = await xml(parts.concat(['_rels', name + '.rels']).join('/'));
    var map = {};
    if (!doc) return map;
    Array.prototype.forEach.call(doc.getElementsByTagName('Relationship'), function (rel) {
      if (rel.getAttribute('TargetMode') === 'External') return;
      map[rel.getAttribute('Id')] = {
        path: resolve(path, rel.getAttribute('Target')),
        type: rel.getAttribute('Type') || '',
      };
    });
    return map;
  }

  function child(el, ns, name) {
    if (!el) return null;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.namespaceURI === ns && n.localName === name) return n;
    }
    return null;
  }
  function children(el, ns, name) {
    var out = [];
    if (!el) return out;
    for (var n = el.firstElementChild; n; n = n.nextElementSibling) {
      if (n.namespaceURI === ns && n.localName === name) out.push(n);
    }
    return out;
  }
  function descendants(el, ns, name) {
    return el ? Array.prototype.slice.call(el.getElementsByTagNameNS(ns, name)) : [];
  }

  function color(el) {
    var srgb = el && descendants(el, A, 'srgbClr')[0];
    return srgb ? '#' + srgb.getAttribute('val') : null;
  }

  // ---- Layout inheritance -------------------------------------------------

  function placeholder(sp) {
    var nv = child(sp, P, 'nvSpPr') || child(sp, P, 'nvPicPr') || child(sp, P, 'nvGraphicFramePr');
    var ph = nv && descendants(nv, P, 'ph')[0];
    return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') } : null;
  }

  function xfrm(el) {
    var spPr = child(el, P, 'spPr');
    var x = (spPr && child(spPr, A, 'xfrm')) || child(el, P, 'xfrm');
    var off = x && child(x, A, 'off');
    var ext = x && child(x, A, 'ext');
    if (!off || !ext) return null;
    return {
      x: +off.getAttribute('x'),
      y: +off.getAttribute('y'),
      w: +ext.getAttribute('cx'),
      h: +ext.getAttribute('cy'),
    };
  }

  /** Position of a shape, falling back to its placeholder on the layout or master. */
  function position(sp, inherited) {
    var own = xfrm(sp);
    if (own) return own;
    var ph = placeholder(sp);
    if (!ph) return null;
    for (var i = 0; i < inherited.length; i++) {
      var match = inherited[i].find(function (candidate) {
        return (
          (ph.idx && candidate.ph.idx === ph.idx) ||
          candidate.ph.type === ph.type ||
          (ph.type === 'ctrTitle' && candidate.ph.type === 'title') ||
          (ph.type === 'subTitle' && candidate.ph.type === 'body')
        );
      });
      if (match) return match.box;
    }
    return null;
  }

  function placeholderBoxes(doc) {
    if (!doc) return [];
    return descendants(doc, P, 'sp')
      .map(function (sp) {
        return { ph: placeholder(sp), box: xfrm(sp) };
      })
      .filter(function (p) {
        return p.ph && p.box;
      });
  }

  // ---- Rendering ----------------------------------------------------------

  function pct(value, total) {
    return ((value / total) * 100).toFixed(3) + '%';
  }

  function defaultSize(sp) {
    var ph = placeholder(sp);
    if (!ph) return 18;
    if (ph.type === 'title' || ph.type === 'ctrTitle') return 40;
    if (ph.type === 'subTitle') return 24;
    return 20;
  }

  /** HTML for a paragraph; the id links the editable element back to its <a:p>. */
  function paragraphHtml(p, id, fallbackSize, editable, number) {
    var pPr = child(p, A, 'pPr');
    var align = { ctr: 'center', r: 'right', just: 'justify' }[pPr && pPr.getAttribute('algn')] || 'left';
    // Bullets are drawn as a non-editable marker (CSS ::before), not as text.
    var buChar = pPr && child(pPr, A, 'buChar');
    var bullet = buChar ? buChar.getAttribute('char') || '•' : pPr && child(pPr, A, 'buAutoNum') ? number + '.' : '';
    var runs = [];
    var firstSize = null;
    for (var n = p.firstElementChild; n; n = n.nextElementSibling) {
      if (n.namespaceURI !== A) continue;
      if (n.localName === 'br') {
        runs.push('<br>');
        continue;
      }
      if (n.localName !== 'r' && n.localName !== 'fld') continue;
      var rPr = child(n, A, 'rPr');
      var t = child(n, A, 't');
      var sz = rPr && rPr.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : null;
      if (sz && !firstSize) firstSize = sz;
      var css = [];
      if (sz) css.push('font-size:calc(var(--pt) * ' + sz + ')');
      if (rPr && rPr.getAttribute('b') === '1') css.push('font-weight:bold');
      if (rPr && rPr.getAttribute('i') === '1') css.push('font-style:italic');
      if (rPr && rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') css.push('text-decoration:underline');
      var c = rPr && color(child(rPr, A, 'solidFill'));
      if (c) css.push('color:' + c);
      runs.push('<span style="' + css.join(';') + '">' + escapeHtml(t ? t.textContent : '') + '</span>');
    }
    var end = child(p, A, 'endParaRPr');
    var size = firstSize || (end && end.getAttribute('sz') ? +end.getAttribute('sz') / 100 : fallbackSize);
    var attrs = editable ? ' contenteditable="true" data-p="' + id + '"' : '';
    if (bullet) attrs += ' data-bullet="' + escapeHtml(bullet) + '"';
    return (
      '<div class="p' + (bullet ? ' bullet' : '') + '"' + attrs + ' style="text-align:' + align + ';font-size:calc(var(--pt) * ' + size + ')">' +
      (runs.join('') || '<br>') +
      '</div>'
    );
  }

  function textBodyHtml(txBody, slideIndex, prefix, fallbackSize, editable) {
    var number = 0;
    return children(txBody, A, 'p')
      .map(function (p, i) {
        var id = slideIndex + ':' + prefix + ':' + i;
        p.__id = id;
        var pPr = child(p, A, 'pPr');
        number = pPr && child(pPr, A, 'buAutoNum') ? number + 1 : 0;
        return paragraphHtml(p, id, fallbackSize, editable, number);
      })
      .join('');
  }

  async function imageUrl(blipEmbed, slideRels) {
    var rel = slideRels[blipEmbed];
    var file = rel && zip.file(rel.path);
    if (!file) return null;
    var ext = rel.path.split('.').pop().toLowerCase();
    var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' }[ext];
    if (!mime) return null; // e.g. EMF/WMF can't be shown in a browser
    return 'data:' + mime + ';base64,' + (await file.async('base64'));
  }

  async function slideHtml(slide, index, editable) {
    var doc = slide.doc;
    var html = [];
    var bg = descendants(doc, P, 'bg')[0];
    var background = color(bg) || '#ffffff';
    var tree = descendants(doc, P, 'spTree')[0];
    var shapeIndex = 0;

    async function walk(parent) {
      for (var el = parent.firstElementChild; el; el = el.nextElementSibling) {
        if (el.namespaceURI !== P) continue;
        var name = el.localName;
        if (name === 'grpSp') {
          await walk(el); // group offsets are ignored; children usually use slide coordinates
          continue;
        }
        var box = position(el, slide.inherited);
        if (!box) continue;
        var style =
          'left:' + pct(box.x, size.cx) + ';top:' + pct(box.y, size.cy) +
          ';width:' + pct(box.w, size.cx) + ';height:' + pct(box.h, size.cy);
        var id = 's' + shapeIndex++;
        if (name === 'sp') {
          var spPr = child(el, P, 'spPr');
          var fill = spPr && color(child(spPr, A, 'solidFill'));
          var txBody = child(el, P, 'txBody');
          var bodyPr = txBody && child(txBody, A, 'bodyPr');
          var anchor = { ctr: 'center', b: 'flex-end' }[bodyPr && bodyPr.getAttribute('anchor')] || 'flex-start';
          html.push(
            '<div class="shape" style="' + style + ';justify-content:' + anchor +
              (fill ? ';background:' + fill : '') + '">' +
              (txBody ? textBodyHtml(txBody, index, id, defaultSize(el), editable) : '') +
              '</div>',
          );
        } else if (name === 'pic') {
          var blip = descendants(el, A, 'blip')[0];
          var src = blip && (await imageUrl(blip.getAttributeNS(R, 'embed'), slide.rels));
          if (src) html.push('<img class="shape" style="' + style + '" src="' + src + '">');
        } else if (name === 'graphicFrame') {
          var tbl = descendants(el, A, 'tbl')[0];
          if (!tbl) continue;
          var rows = children(tbl, A, 'tr').map(function (tr, r) {
            return (
              '<tr>' +
              children(tr, A, 'tc')
                .map(function (tc, c) {
                  var body = child(tc, A, 'txBody');
                  return '<td>' + (body ? textBodyHtml(body, index, id + 'r' + r + 'c' + c, 14, editable) : '') + '</td>';
                })
                .join('') +
              '</tr>'
            );
          });
          html.push('<div class="shape" style="' + style + '"><table>' + rows.join('') + '</table></div>');
        }
      }
    }
    if (tree) await walk(tree);
    return '<div class="slide" style="background:' + background + '">' + html.join('') + '</div>';
  }

  function scaleSlides() {
    // 1pt of the slide in screen pixels, for each rendered slide's width.
    container.querySelectorAll('.slide').forEach(function (el) {
      el.style.setProperty('--pt', (el.clientWidth / (size.cx / EMU_PER_PT)) + 'px');
    });
  }

  async function render() {
    var html = [];
    for (var i = 0; i < slides.length; i++) html.push('<div class="label">Slide ' + (i + 1) + '</div>' + (await slideHtml(slides[i], i, true)));
    container.innerHTML = html.join('');
    container.style.setProperty('--ratio', size.cy / size.cx);
    scaleSlides();
  }
  window.addEventListener('resize', scaleSlides);

  // ---- Editing ------------------------------------------------------------

  function paragraphById(id) {
    var slide = slides[+id.split(':')[0]];
    return descendants(slide.doc, A, 'p').find(function (p) { return p.__id === id; });
  }

  container.addEventListener('input', function (e) {
    var el = e.target.closest('[data-p]');
    if (!el) return;
    var id = el.dataset.p;
    slides[+id.split(':')[0]].edits.set(id, el.innerText.replace(/\n+$/, ''));
    changed();
  });
  // One paragraph per editable block; keep line breaks within it as spaces.
  container.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.closest('[data-p]')) e.preventDefault();
  });
  container.addEventListener('paste', function (e) {
    if (!e.target.closest('[data-p]')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  });

  /** Writes edited text into the paragraph, keeping the first run's formatting. */
  function applyEdit(p, text) {
    var runs = children(p, A, 'r').concat(children(p, A, 'fld'));
    var first = children(p, A, 'r')[0];
    if (!first) {
      first = p.ownerDocument.createElementNS(A, 'a:r');
      var end = child(p, A, 'endParaRPr');
      if (end) {
        var rPr = p.ownerDocument.createElementNS(A, 'a:rPr');
        Array.prototype.forEach.call(end.attributes, function (attr) {
          rPr.setAttribute(attr.name, attr.value);
        });
        first.appendChild(rPr);
      }
      first.appendChild(p.ownerDocument.createElementNS(A, 'a:t'));
      p.insertBefore(first, child(p, A, 'endParaRPr'));
    }
    runs.forEach(function (r) {
      if (r !== first) r.parentNode.removeChild(r);
    });
    children(p, A, 'br').forEach(function (br) { br.parentNode.removeChild(br); });
    var t = child(first, A, 't') || first.appendChild(p.ownerDocument.createElementNS(A, 'a:t'));
    t.textContent = text;
  }

  // ---- Bridge ---------------------------------------------------------------

  window.__open = async function (base64) {
    try {
      zip = await JSZip.loadAsync(base64, { base64: true });
      var presentation = await xml('ppt/presentation.xml');
      if (!presentation) throw new Error('Not a PowerPoint presentation');
      var sldSz = descendants(presentation, P, 'sldSz')[0];
      if (sldSz) size = { cx: +sldSz.getAttribute('cx'), cy: +sldSz.getAttribute('cy') };
      var presRels = await rels('ppt/presentation.xml');
      slides = [];
      for (var sldId of descendants(presentation, P, 'sldId')) {
        var rel = presRels[sldId.getAttributeNS(R, 'id')];
        if (!rel) continue;
        var doc = await xml(rel.path);
        if (!doc) continue;
        var slideRels = await rels(rel.path);
        var layout = Object.values(slideRels).find(function (r) { return /slideLayout$/.test(r.type); });
        var layoutDoc = layout ? await xml(layout.path) : null;
        var master = layout && Object.values(await rels(layout.path)).find(function (r) { return /slideMaster$/.test(r.type); });
        var masterDoc = master ? await xml(master.path) : null;
        slides.push({
          path: rel.path,
          doc: doc,
          rels: slideRels,
          inherited: [placeholderBoxes(layoutDoc), placeholderBoxes(masterDoc)],
          edits: new Map(),
        });
      }
      await render();
      changeReported = false;
      post({ type: 'opened', slides: slides.length });
    } catch (error) {
      post({ type: 'open-error', message: errorMessage(error) });
    }
  };

  window.__toPptx = async function (requestId) {
    try {
      for (var slide of slides) {
        if (slide.edits.size === 0) continue;
        slide.edits.forEach(function (text, id) {
          var p = paragraphById(id);
          if (p) applyEdit(p, text);
        });
        slide.edits.clear();
        zip.file(slide.path, new XMLSerializer().serializeToString(slide.doc));
      }
      var base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
      changeReported = false;
      post({ type: 'pptx', requestId: requestId, base64: base64 });
    } catch (error) {
      post({ type: 'error', requestId: requestId, message: errorMessage(error) });
    }
  };

  window.__getHtml = function (requestId) {
    try {
      // Print what's on screen, so unsaved edits are included.
      var edited = container.cloneNode(true);
      edited.querySelectorAll('.label').forEach(function (l) { l.remove(); });
      edited.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
      // Drop the on-screen scale so the print stylesheet's 1pt = 1pt applies.
      edited.querySelectorAll('.slide').forEach(function (el) { el.style.removeProperty('--pt'); });
      post({
        type: 'html',
        requestId: requestId,
        html: edited.innerHTML,
        ratio: size.cy / size.cx,
        widthPt: size.cx / EMU_PER_PT,
      });
    } catch (error) {
      post({ type: 'error', requestId: requestId, message: errorMessage(error) });
    }
  };

  post({ type: 'ready' });
})();
`;

/** Slide styles shared by the editor and the printed PDF. */
export const SLIDE_CSS = `
  .slide { position: relative; width: 100%; aspect-ratio: calc(1 / var(--ratio, 0.5625)); overflow: hidden;
    font-family: Calibri, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111;
    --pt: 1px; }
  .shape { position: absolute; display: flex; flex-direction: column; box-sizing: border-box;
    padding: calc(var(--pt) * 3.6) calc(var(--pt) * 7.2); overflow: hidden; }
  img.shape { padding: 0; object-fit: fill; }
  .p { line-height: 1.15; min-height: 1em; outline: none; word-wrap: break-word; }
  .p.bullet { padding-left: 1.2em; position: relative; }
  .p.bullet::before { content: attr(data-bullet); position: absolute; left: 0.2em; }
  .shape table { width: 100%; height: 100%; border-collapse: collapse; }
  .shape td { border: 1px solid #bbb; padding: calc(var(--pt) * 3); vertical-align: top; }
`;

export const POWERPOINT_EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  ${SLIDE_CSS}
  html, body { margin: 0; background: #e4e6eb; font-family: -apple-system, Roboto, sans-serif; }
  #slides { padding: 8px 12px 24px; }
  .label { font: 600 12px -apple-system, Roboto, sans-serif; color: #60646c; margin: 12px 2px 6px; }
  .slide { box-shadow: 0 1px 4px rgba(0,0,0,0.2); background: #fff; }
  [contenteditable]:focus { background: rgba(211, 82, 48, 0.08); box-shadow: 0 0 0 1px #d35230; }
</style>
</head>
<body>
<div id="slides"></div>
<script>${JSZIP_LIB}</script>
<script>${BRIDGE}</script>
</body>
</html>`;

/**
 * Standalone HTML for printing slides to PDF, one slide per page. `widthPt`
 * and `ratio` come from the presentation's slide size.
 */
export function printableSlidesHtml(slidesHtml: string, widthPt: number, ratio: number) {
  const heightPt = widthPt * ratio;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${widthPt}pt ${heightPt}pt; margin: 0; }
  html, body { margin: 0; }
  ${SLIDE_CSS}
  .slide { width: ${widthPt}pt; height: ${heightPt}pt; aspect-ratio: auto; --pt: 1pt;
    page-break-after: always; break-after: page; }
</style>
</head>
<body>${slidesHtml}</body>
</html>`;
}
