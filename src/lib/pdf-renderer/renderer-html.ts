import { PDFJS_LIB, PDFJS_WORKER } from './pdfjs-source.generated';

/**
 * Page that hosts pdf.js inside a hidden WebView. React Native drives it via
 * `injectJavaScript` (window.__load / window.__render) and receives results
 * through `ReactNativeWebView.postMessage`.
 *
 * Loading the worker script inline exposes `window.pdfjsWorker`, which makes
 * pdf.js run its worker on the main thread instead of spawning a Web Worker.
 */
const BRIDGE = `
(function () {
  var lib = window.pdfjsLib;
  var doc = null;
  var queue = Promise.resolve();

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

  window.__load = function (base64, token) {
    queue = queue.then(async function () {
      try {
        if (doc) await doc.destroy();
        doc = await lib.getDocument({ data: decodeBase64(base64), isEvalSupported: false }).promise;
        var pages = [];
        for (var i = 1; i <= doc.numPages; i++) {
          var page = await doc.getPage(i);
          var viewport = page.getViewport({ scale: 1 });
          pages.push({ width: viewport.width, height: viewport.height, rotation: page.rotate });
        }
        post({ type: 'loaded', token: token, pages: pages });
      } catch (error) {
        doc = null;
        post({ type: 'load-error', token: token, message: errorMessage(error) });
      }
    });
  };

  var SAMPLE_SCALE = 2;

  function hex(c) {
    return (
      '#' +
      [c[0], c[1], c[2]]
        .map(function (v) {
          return ('0' + Math.round(v).toString(16)).slice(-2);
        })
        .join('')
    );
  }

  // Estimates the background and ink colors inside a box of a rendered page:
  // the most common color is the background, and the ink is the average of the
  // pixels that differ most from it.
  function sampleColors(image, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(image.width, Math.ceil(x1));
    y1 = Math.min(image.height, Math.ceil(y1));
    var data = image.data;
    var buckets = {};
    var best = null;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = (y * image.width + x) * 4;
        var key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4);
        var bucket = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
        bucket.n++;
        bucket.r += data[i];
        bucket.g += data[i + 1];
        bucket.b += data[i + 2];
        if (!best || bucket.n > best.n) best = bucket;
      }
    }
    if (!best) return { background: '#ffffff', color: '#000000' };
    var bg = [best.r / best.n, best.g / best.n, best.b / best.n];
    var maxDistance = 0;
    var y2, x2, j, d;
    for (y2 = y0; y2 < y1; y2++) {
      for (x2 = x0; x2 < x1; x2++) {
        j = (y2 * image.width + x2) * 4;
        d = Math.hypot(data[j] - bg[0], data[j + 1] - bg[1], data[j + 2] - bg[2]);
        if (d > maxDistance) maxDistance = d;
      }
    }
    if (maxDistance < 40) return { background: hex(bg), color: '#000000' };
    var ink = [0, 0, 0];
    var count = 0;
    for (y2 = y0; y2 < y1; y2++) {
      for (x2 = x0; x2 < x1; x2++) {
        j = (y2 * image.width + x2) * 4;
        d = Math.hypot(data[j] - bg[0], data[j + 1] - bg[1], data[j + 2] - bg[2]);
        if (d >= maxDistance * 0.75) {
          ink[0] += data[j];
          ink[1] += data[j + 1];
          ink[2] += data[j + 2];
          count++;
        }
      }
    }
    return { background: hex(bg), color: hex([ink[0] / count, ink[1] / count, ink[2] / count]) };
  }

  // Text runs and fillable form fields of a page, in base page coordinates
  // (pdf.js viewport at scale 1, origin top-left). Only runs that read
  // left-to-right in that view are returned.
  window.__text = function (requestId, index) {
    queue = queue.then(async function () {
      try {
        if (!doc) throw new Error('No document loaded');
        var page = await doc.getPage(index + 1);
        var viewport = page.getViewport({ scale: 1 });

        // Render once to sample colors; this also loads the page's fonts.
        var sampleViewport = page.getViewport({ scale: SAMPLE_SCALE });
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(sampleViewport.width);
        canvas.height = Math.round(sampleViewport.height);
        var context = canvas.getContext('2d', { willReadFrequently: true });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: sampleViewport }).promise;
        var image = context.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = canvas.height = 0;

        var content = await page.getTextContent();
        var items = [];
        content.items.forEach(function (item) {
          if (!item.str || !item.str.trim()) return;
          var tx = lib.Util.transform(viewport.transform, item.transform);
          // Skip rotated or vertical text.
          if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0]) || tx[0] <= 0) return;
          var fontSize = Math.hypot(tx[2], tx[3]);
          var width = item.width * viewport.scale;
          var style = content.styles[item.fontName] || {};
          var font = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : {};
          var colors = sampleColors(
            image,
            tx[4] * SAMPLE_SCALE,
            (tx[5] - fontSize * 0.95) * SAMPLE_SCALE,
            (tx[4] + width) * SAMPLE_SCALE,
            (tx[5] + fontSize * 0.3) * SAMPLE_SCALE,
          );
          items.push({
            text: item.str,
            x: tx[4],
            baseline: tx[5],
            width: width,
            fontSize: fontSize,
            fontFamily: style.fontFamily || 'sans-serif',
            fontName: font.name || '',
            // pdf.js doesn't always flag subset fonts, so also check the name.
            bold: !!(font.bold || font.black || /bold|black|heavy|semibold|demi/i.test(font.name || '')),
            italic: !!(font.italic || /italic|oblique/i.test(font.name || '')),
            color: colors.color,
            background: colors.background,
          });
        });

        var fields = [];
        (await page.getAnnotations()).forEach(function (annotation) {
          if (annotation.subtype !== 'Widget' || !annotation.fieldName) return;
          var kind =
            annotation.fieldType === 'Tx'
              ? 'text'
              : annotation.checkBox
                ? 'checkbox'
                : annotation.radioButton
                  ? 'radio'
                  : annotation.fieldType === 'Ch'
                    ? 'choice'
                    : null;
          if (!kind) return;
          var r = viewport.convertToViewportRectangle(annotation.rect);
          fields.push({
            name: annotation.fieldName,
            kind: kind,
            x: Math.min(r[0], r[2]),
            y: Math.min(r[1], r[3]),
            w: Math.abs(r[2] - r[0]),
            h: Math.abs(r[3] - r[1]),
            option: annotation.buttonValue || null,
            readOnly: !!annotation.readOnly,
          });
        });

        post({ type: 'text', requestId: requestId, items: items, fields: fields });
      } catch (error) {
        post({ type: 'text-error', requestId: requestId, message: errorMessage(error) });
      }
    });
  };

  window.__render = function (requestId, index, width, extraRotation) {
    queue = queue.then(async function () {
      try {
        if (!doc) throw new Error('No document loaded');
        var page = await doc.getPage(index + 1);
        var rotation = (page.rotate + extraRotation) % 360;
        var unscaled = page.getViewport({ scale: 1, rotation: rotation });
        var viewport = page.getViewport({ scale: width / unscaled.width, rotation: rotation });
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        var context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        canvas.width = canvas.height = 0;
        post({ type: 'rendered', requestId: requestId, dataUrl: dataUrl });
      } catch (error) {
        post({ type: 'render-error', requestId: requestId, message: errorMessage(error) });
      }
    });
  };

  post({ type: 'ready' });
})();
`;

export const RENDERER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body>
<script>${PDFJS_LIB}</script>
<script>${PDFJS_WORKER}</script>
<script>${BRIDGE}</script>
</body>
</html>`;
