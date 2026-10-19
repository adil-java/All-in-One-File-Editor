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

  // Text runs of a page in base page coordinates (pdf.js viewport at scale 1,
  // origin top-left). Only runs that read left-to-right in that view are returned.
  window.__text = function (requestId, index) {
    queue = queue.then(async function () {
      try {
        if (!doc) throw new Error('No document loaded');
        var page = await doc.getPage(index + 1);
        var viewport = page.getViewport({ scale: 1 });
        var content = await page.getTextContent();
        var items = [];
        content.items.forEach(function (item) {
          if (!item.str || !item.str.trim()) return;
          var tx = lib.Util.transform(viewport.transform, item.transform);
          // Skip rotated or vertical text.
          if (Math.abs(tx[1]) > 0.01 * Math.abs(tx[0]) || tx[0] <= 0) return;
          var fontSize = Math.hypot(tx[2], tx[3]);
          var style = content.styles[item.fontName] || {};
          items.push({
            text: item.str,
            x: tx[4],
            baseline: tx[5],
            width: item.width * viewport.scale,
            fontSize: fontSize,
            fontFamily: style.fontFamily || 'sans-serif',
          });
        });
        post({ type: 'text', requestId: requestId, items: items });
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
