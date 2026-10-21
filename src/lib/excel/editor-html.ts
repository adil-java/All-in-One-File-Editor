import { EXCELJS_LIB } from '@/lib/office/office-source.generated';

/**
 * Page that edits Excel workbooks (.xlsx) inside a WebView, using ExcelJS so
 * formatting, formulas, merged cells and column widths survive a save.
 *
 * React Native drives it via `injectJavaScript`:
 *   window.__open(base64)          load a workbook
 *   window.__toXlsx(requestId)     current workbook as .xlsx (base64)
 *   window.__getHtml(requestId)    printable HTML of every sheet (for PDF)
 * and receives: ready, opened, open-error, changed, xlsx, html, error.
 */
const BRIDGE = String.raw`
(function () {
  var workbook = null;
  var sheetIndex = 0;
  var selected = { row: 1, col: 1 };
  var changeReported = false;
  var grid = document.getElementById('grid');
  var input = document.getElementById('value');
  var address = document.getElementById('address');
  var tabs = document.getElementById('tabs');

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
  function encodeBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function changed() {
    if (changeReported) return;
    changeReported = true;
    post({ type: 'changed' });
  }

  function sheet() {
    return workbook.worksheets[sheetIndex];
  }

  function columnName(n) {
    var s = '';
    for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  // ---- Display ---------------------------------------------------------

  function argbColor(color) {
    if (!color || !color.argb || color.argb.length < 8) return null;
    return '#' + color.argb.slice(2);
  }

  /** Text shown for a cell, with basic number formats applied. */
  function displayValue(cell) {
    var value = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      if (value instanceof Date) return value.toLocaleDateString();
      if ('result' in value || 'formula' in value || 'sharedFormula' in value) {
        value = value.result;
        if (value === undefined || value === null) return '';
        if (typeof value === 'object' && value.error) return value.error;
      } else if (value.richText) {
        return value.richText.map(function (r) { return r.text; }).join('');
      } else if (value.text !== undefined) {
        return String(value.text); // hyperlink
      } else if (value.error) {
        return value.error;
      }
    }
    if (typeof value === 'number') {
      var fmt = cell.numFmt || '';
      var decimals = (/0\.(0+)/.exec(fmt) || [null, ''])[1].length;
      if (fmt.indexOf('%') >= 0) return (value * 100).toFixed(decimals) + '%';
      if (fmt.indexOf('#,##0') >= 0 || /[$€£₹]/.test(fmt)) {
        var symbol = (/[$€£₹]/.exec(fmt) || [''])[0];
        return symbol + value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      }
      if (decimals) return value.toFixed(decimals);
      return String(Math.round(value * 1e10) / 1e10);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  /** Text shown in the formula bar: formulas as =..., everything else as typed. */
  function editValue(cell) {
    var value = cell.value;
    if (value && typeof value === 'object') {
      if (value.formula) return '=' + value.formula;
      if (value.sharedFormula) return '=' + (cell.formula || value.sharedFormula);
      if (value instanceof Date) return value.toISOString().slice(0, 10);
    }
    // Raw numbers, so editing "$45.50" can't turn the cell into text.
    if (typeof value === 'number') return String(value);
    return displayValue(cell);
  }

  // ---- Formula recalculation -------------------------------------------
  // Evaluates common formulas so results update while editing. Formulas are
  // tokenized against a strict whitelist (numbers, cell references, operators
  // and the functions below); anything else is left uncalculated, so content
  // from a file can never run as code.

  function flat(args) {
    return args.reduce(function (all, a) { return all.concat(Array.isArray(a) ? a : [a]); }, []);
  }
  function nums(args) {
    return flat(args).filter(function (n) { return typeof n === 'number' && !isNaN(n); });
  }
  var FUNCTIONS = {
    SUM: function () { return nums([].slice.call(arguments)).reduce(function (a, b) { return a + b; }, 0); },
    AVERAGE: function () { var n = nums([].slice.call(arguments)); return n.length ? FUNCTIONS.SUM(n) / n.length : NaN; },
    MIN: function () { var n = nums([].slice.call(arguments)); return n.length ? Math.min.apply(null, n) : 0; },
    MAX: function () { var n = nums([].slice.call(arguments)); return n.length ? Math.max.apply(null, n) : 0; },
    COUNT: function () { return nums([].slice.call(arguments)).length; },
    PRODUCT: function () { return nums([].slice.call(arguments)).reduce(function (a, b) { return a * b; }, 1); },
    ROUND: function (n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; },
    ABS: function (n) { return Math.abs(n); },
    IF: function (c, a, b) { return c ? a : (b === undefined ? false : b); },
  };

  function columnNumber(letters) {
    return letters.toUpperCase().split('').reduce(function (n, c) { return n * 26 + c.charCodeAt(0) - 64; }, 0);
  }

  function numberAt(ws, row, col) {
    var v = ws.getRow(row).getCell(col).value;
    if (v && typeof v === 'object' && 'result' in v) v = v.result;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    throw new Error('not a number');
  }

  var TOKEN = /\s*(?:\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)|\$?([A-Z]{1,3})\$?(\d+)(?![\w(])|(\d+\.?\d*(?:E[-+]?\d+)?|\.\d+)|([A-Z]+)\(|(<>|<=|>=|[-+*\/^(),<>=]))/iy;

  /** Value of a formula, or undefined when it uses anything unsupported. */
  function evaluate(ws, formula) {
    var js = '';
    TOKEN.lastIndex = 0;
    try {
      while (TOKEN.lastIndex < formula.length) {
        var m = TOKEN.exec(formula);
        if (!m) return undefined;
        if (m[1]) {
          var r1 = +m[2], r2 = +m[4], c1 = columnNumber(m[1]), c2 = columnNumber(m[3]);
          if ((r2 - r1 + 1) * (c2 - c1 + 1) > 20000) return undefined;
          var values = [];
          for (var r = r1; r <= r2; r++)
            for (var c = c1; c <= c2; c++) {
              try { values.push(numberAt(ws, r, c)); } catch (e) { /* text cells are skipped in ranges */ }
            }
          js += '[' + values.join(',') + ']';
        } else if (m[5]) js += '(' + numberAt(ws, +m[6], columnNumber(m[5])) + ')';
        else if (m[7]) js += m[7];
        else if (m[8]) {
          var name = m[8].toUpperCase();
          if (!FUNCTIONS[name]) return undefined;
          js += 'F.' + name + '(';
        } else js += { '^': '**', '=': '==', '<>': '!=' }[m[9]] || m[9];
        if (/^\s*$/.test(formula.slice(TOKEN.lastIndex))) break;
      }
      var result = new Function('F', 'return (' + js + ');')(FUNCTIONS);
      return typeof result === 'number' && !isFinite(result) ? undefined : result;
    } catch (e) {
      return undefined;
    }
  }

  /** Recomputes formula results on a sheet (a few passes so chains settle). */
  function recalc(ws) {
    var cells = [];
    ws.eachRow(function (row) {
      row.eachCell(function (cell) {
        var v = cell.value;
        if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) cells.push(cell);
      });
    });
    for (var pass = 0; pass < 4; pass++) {
      cells.forEach(function (cell) {
        var formula = cell.formula || cell.value.formula;
        var result = formula && evaluate(ws, formula);
        if (result === undefined) return;
        var v = cell.value;
        if (v.sharedFormula) cell.value = { sharedFormula: v.sharedFormula, result: result };
        else cell.value = { formula: v.formula, result: result };
      });
    }
  }

  function cellStyle(cell, forPrint) {
    var css = [];
    var font = cell.font || {};
    if (font.bold) css.push('font-weight:bold');
    if (font.italic) css.push('font-style:italic');
    if (font.underline) css.push('text-decoration:underline');
    if (font.size) css.push('font-size:' + font.size + 'pt');
    var color = argbColor(font.color);
    if (color) css.push('color:' + color);
    var fill = cell.fill;
    if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
      var bg = argbColor(fill.fgColor);
      if (bg) css.push('background:' + bg);
    }
    var align = cell.alignment || {};
    var horizontal = align.horizontal;
    var raw = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
    if (!horizontal && typeof raw === 'number') horizontal = 'right';
    if (horizontal && horizontal !== 'general') css.push('text-align:' + horizontal);
    if (align.wrapText) css.push('white-space:pre-wrap');
    return css.join(';');
  }

  /** Merged ranges: top-left "row,col" -> span, and covered cells to skip. */
  function mergeInfo(ws) {
    var spans = {};
    var covered = {};
    (ws.model.merges || []).forEach(function (range) {
      var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
      if (!m) return;
      var toCol = function (letters) {
        return letters.split('').reduce(function (n, c) { return n * 26 + c.charCodeAt(0) - 64; }, 0);
      };
      var r1 = +m[2], c1 = toCol(m[1]), r2 = +m[4], c2 = toCol(m[3]);
      spans[r1 + ',' + c1] = { rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
      for (var r = r1; r <= r2; r++)
        for (var c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered[r + ',' + c] = true;
    });
    return { spans: spans, covered: covered };
  }

  /** Table HTML for a sheet. With extra=true, adds empty rows/columns to type into. */
  function tableHtml(ws, extra, forPrint) {
    var rows = Math.max(ws.actualRowCount ? ws.rowCount : 0, 1);
    var cols = Math.max(ws.actualColumnCount ? ws.columnCount : 0, 1);
    if (extra) {
      rows = Math.max(rows + 20, 50);
      cols = Math.max(cols + 4, 10);
    }
    var merges = mergeInfo(ws);
    var colgroup = [];
    var total = forPrint ? 0 : 40;
    if (!forPrint) colgroup.push('<col style="width:40px">');
    for (var c = 1; c <= cols; c++) {
      var width = Math.round((ws.getColumn(c).width || 9) * 7.5);
      total += width;
      colgroup.push('<col style="width:' + width + 'px">');
    }
    // Fixed layout only honors column widths when the table has a width.
    var html = ['<table class="sheet" style="width:' + total + 'px"><colgroup>' + colgroup.join('') + '</colgroup>'];
    if (!forPrint) {
      html.push('<tr><th class="corner"></th>');
      for (c = 1; c <= cols; c++) html.push('<th class="col-head">' + columnName(c) + '</th>');
      html.push('</tr>');
    }
    for (var r = 1; r <= rows; r++) {
      var row = ws.getRow(r);
      var height = row.height ? ' style="height:' + Math.round(row.height * 1.33) + 'px"' : '';
      html.push('<tr' + height + '>');
      if (!forPrint) html.push('<th class="row-head">' + r + '</th>');
      for (c = 1; c <= cols; c++) {
        if (merges.covered[r + ',' + c]) continue;
        var span = merges.spans[r + ',' + c];
        var cell = row.getCell(c);
        var attrs = ' data-r="' + r + '" data-c="' + c + '"';
        if (span) attrs += ' rowspan="' + span.rows + '" colspan="' + span.cols + '"';
        var style = cellStyle(cell, forPrint);
        if (style) attrs += ' style="' + style + '"';
        html.push('<td' + attrs + '>' + escapeHtml(displayValue(cell)) + '</td>');
      }
      html.push('</tr>');
    }
    html.push('</table>');
    return html.join('');
  }

  function render() {
    var ws = sheet();
    grid.innerHTML = tableHtml(ws, true, false);
    tabs.innerHTML = workbook.worksheets
      .map(function (s, i) {
        return '<button data-sheet="' + i + '" class="' + (i === sheetIndex ? 'active' : '') + '">' +
          escapeHtml(s.name) + '</button>';
      })
      .join('');
    select(selected.row, selected.col);
  }

  function select(row, col) {
    selected = { row: row, col: col };
    var prev = grid.querySelector('td.selected');
    if (prev) prev.classList.remove('selected');
    var td = grid.querySelector('td[data-r="' + row + '"][data-c="' + col + '"]');
    if (td) td.classList.add('selected');
    address.textContent = columnName(col) + row;
    var cell = sheet().getRow(row).getCell(col);
    input.value = editValue(cell);
    document.getElementById('bold').classList.toggle('active', !!(cell.font && cell.font.bold));
  }

  // ---- Editing ---------------------------------------------------------

  function parseInput(text) {
    if (text === '') return null;
    if (text[0] === '=') return { formula: text.slice(1) };
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text.trim())) return Number(text);
    if (/^(true|false)$/i.test(text.trim())) return /^true$/i.test(text.trim());
    return text;
  }

  function commit() {
    var cell = sheet().getRow(selected.row).getCell(selected.col);
    if (input.value === editValue(cell)) return;
    var value = parseInput(input.value);
    cell.value = value;
    changed();
    recalc(sheet());
    render();
  }

  grid.addEventListener('click', function (e) {
    var td = e.target.closest('td');
    if (!td) return;
    commit();
    select(+td.dataset.r, +td.dataset.c);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      select(selected.row + 1, selected.col);
      input.blur();
    }
  });
  input.addEventListener('blur', commit);

  tabs.addEventListener('click', function (e) {
    var button = e.target.closest('button');
    if (!button) return;
    commit();
    sheetIndex = +button.dataset.sheet;
    selected = { row: 1, col: 1 };
    render();
  });

  function action(id, fn) {
    var button = document.getElementById(id);
    button.addEventListener('mousedown', function (e) { e.preventDefault(); });
    button.addEventListener('click', function () {
      commit();
      fn(sheet());
      changed();
      recalc(sheet());
      render();
    });
  }

  action('bold', function (ws) {
    var cell = ws.getRow(selected.row).getCell(selected.col);
    cell.font = Object.assign({}, cell.font, { bold: !(cell.font && cell.font.bold) });
  });
  // 'i' copies the formatting of the row above, like Excel.
  action('add-row', function (ws) { ws.insertRow(selected.row + 1, [], 'i'); });
  action('add-col', function (ws) { ws.spliceColumns(selected.col + 1, 0, []); });
  action('del-row', function (ws) { ws.spliceRows(selected.row, 1); });
  action('del-col', function (ws) { ws.spliceColumns(selected.col, 1); });

  // ---- Bridge ----------------------------------------------------------

  window.__open = function (base64) {
    workbook = new ExcelJS.Workbook();
    workbook.xlsx
      .load(decodeBase64(base64).buffer)
      .then(function () {
        if (workbook.worksheets.length === 0) workbook.addWorksheet('Sheet1');
        sheetIndex = 0;
        render();
        changeReported = false;
        post({ type: 'opened', sheets: workbook.worksheets.length });
      })
      .catch(function (error) {
        post({ type: 'open-error', message: errorMessage(error) });
      });
  };

  window.__toXlsx = function (requestId) {
    commit();
    // Edited formulas have no cached results; ask Excel to recalculate on open.
    workbook.calcProperties = Object.assign({}, workbook.calcProperties, { fullCalcOnLoad: true });
    workbook.xlsx
      .writeBuffer()
      .then(function (buffer) {
        changeReported = false;
        post({ type: 'xlsx', requestId: requestId, base64: encodeBase64(new Uint8Array(buffer)) });
      })
      .catch(function (error) {
        post({ type: 'error', requestId: requestId, message: errorMessage(error) });
      });
  };

  window.__getHtml = function (requestId) {
    commit();
    var html = workbook.worksheets
      .filter(function (ws) { return ws.actualRowCount > 0; })
      .map(function (ws) {
        return '<h2>' + escapeHtml(ws.name) + '</h2>' + tableHtml(ws, false, true);
      })
      .join('<div style="page-break-after:always"></div>');
    post({ type: 'html', requestId: requestId, html: html });
  };

  post({ type: 'ready' });
})();
`;

/** Table styles shared by the grid and the printed PDF. */
export const SHEET_CSS = `
  table.sheet { border-collapse: collapse; table-layout: fixed; font-family: Calibri, 'Segoe UI',
    Helvetica, Arial, sans-serif; font-size: 11pt; }
  table.sheet td { border: 1px solid #d4d4d4; padding: 2px 4px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; height: 20px; color: #111; }
`;

export const EXCEL_EDITOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
  ${SHEET_CSS}
  html, body { margin: 0; height: 100%; background: #fff; font-family: -apple-system, Roboto, sans-serif; }
  body { display: flex; flex-direction: column; }
  #bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid #dfe1e6; }
  #address { min-width: 44px; font: 600 13px -apple-system, Roboto, sans-serif; color: #60646c; }
  #value { flex: 1; height: 32px; border: 1px solid #dfe1e6; border-radius: 8px; padding: 0 8px; font-size: 15px; }
  #actions { display: flex; gap: 4px; overflow-x: auto; padding: 0 8px 6px; border-bottom: 1px solid #dfe1e6; }
  #actions button, #tabs button { flex: none; height: 32px; border: 1px solid #dfe1e6; border-radius: 8px;
    background: #fff; color: #111; font-size: 13px; padding: 0 10px; }
  #actions button.active, #tabs button.active { background: #e8f5ec; border-color: #1d7a45; color: #1d7a45; }
  #grid { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; }
  th { position: sticky; background: #f3f4f6; color: #60646c; font: 500 12px -apple-system, Roboto, sans-serif;
    border: 1px solid #d4d4d4; z-index: 1; }
  th.col-head { top: 0; }
  th.row-head { left: 0; }
  th.corner { top: 0; left: 0; z-index: 2; }
  td.selected { outline: 2px solid #1d7a45; outline-offset: -2px; }
  #tabs { display: flex; gap: 4px; overflow-x: auto; padding: 6px 8px; border-top: 1px solid #dfe1e6; background: #f9fafb; }
</style>
</head>
<body>
<div id="bar"><span id="address">A1</span><input id="value" autocapitalize="off" autocorrect="off" /></div>
<div id="actions">
  <button id="bold"><b>B</b></button>
  <button id="add-row">+ Row</button>
  <button id="add-col">+ Column</button>
  <button id="del-row">− Row</button>
  <button id="del-col">− Column</button>
</div>
<div id="grid"></div>
<div id="tabs"></div>
<script>${EXCELJS_LIB}</script>
<script>${BRIDGE}</script>
</body>
</html>`;

/** Standalone HTML for printing the workbook to PDF (A4 landscape). */
export function printableSheetsHtml(bodyHtml: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 12mm; }
  html, body { margin: 0; font-family: Calibri, 'Segoe UI', Helvetica, Arial, sans-serif; }
  h2 { font-size: 13pt; margin: 0 0 8px; }
  ${SHEET_CSS}
  table.sheet { max-width: 100%; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
