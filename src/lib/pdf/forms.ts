/**
 * Fillable form (AcroForm) fields: reading them for the form panel and writing
 * new values into the source document.
 */

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  type PDFFont,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
} from 'pdf-lib';

/** Standard font abbreviations commonly used in form default appearances. */
const DA_FONTS: Record<string, StandardFonts> = {
  Helv: StandardFonts.Helvetica,
  HeBo: StandardFonts.HelveticaBold,
  HeOb: StandardFonts.HelveticaOblique,
  HeBO: StandardFonts.HelveticaBoldOblique,
  TiRo: StandardFonts.TimesRoman,
  TiBo: StandardFonts.TimesRomanBold,
  TiIt: StandardFonts.TimesRomanItalic,
  TiBI: StandardFonts.TimesRomanBoldItalic,
  Cour: StandardFonts.Courier,
  CoBo: StandardFonts.CourierBold,
  CoOb: StandardFonts.CourierOblique,
  CoBO: StandardFonts.CourierBoldOblique,
};

/**
 * The standard font closest to the font named in a field's default appearance
 * (e.g. "/TiBo 12 Tf 0 g"), so new values are drawn in the field's own style.
 */
function standardFontFor(defaultAppearance: string | undefined): StandardFonts | null {
  const name = defaultAppearance?.match(/\/([^\s/]+)\s+[\d.]+\s+Tf/)?.[1];
  if (!name) return null;
  if (DA_FONTS[name]) return DA_FONTS[name];
  const bold = /bold|black|heavy|semibold|bd\b/i.test(name);
  const italic = /italic|oblique/i.test(name);
  if (/cour|mono|consol/i.test(name)) {
    return [
      [StandardFonts.Courier, StandardFonts.CourierOblique],
      [StandardFonts.CourierBold, StandardFonts.CourierBoldOblique],
    ][+bold][+italic];
  }
  if (/times|roman|serif|georgia|garamond|cambria/i.test(name) && !/sans/i.test(name)) {
    return [
      [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic],
      [StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic],
    ][+bold][+italic];
  }
  return [
    [StandardFonts.Helvetica, StandardFonts.HelveticaOblique],
    [StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique],
  ][+bold][+italic];
}

type FieldBase = { name: string; readOnly: boolean };

export type FormField =
  | (FieldBase & { type: 'text'; value: string; multiline: boolean })
  | (FieldBase & { type: 'checkbox'; value: boolean })
  | (FieldBase & { type: 'choice'; value: string | null; options: string[] });

export type FormValue = string | boolean | null;

/** Fields the panel can edit. Buttons and signature fields are left out. */
export async function readFormFields(sourceBase64: string): Promise<FormField[]> {
  const doc = await PDFDocument.load(sourceBase64, { ignoreEncryption: true });
  const fields: FormField[] = [];
  for (const field of doc.getForm().getFields()) {
    const base = { name: field.getName(), readOnly: field.isReadOnly() };
    if (field instanceof PDFTextField) {
      fields.push({
        ...base,
        type: 'text',
        value: field.getText() ?? '',
        multiline: field.isMultiline(),
      });
    } else if (field instanceof PDFCheckBox) {
      fields.push({ ...base, type: 'checkbox', value: field.isChecked() });
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      fields.push({
        ...base,
        type: 'choice',
        value: field.getSelected()[0] ?? null,
        options: field.getOptions(),
      });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        ...base,
        type: 'choice',
        value: field.getSelected() ?? null,
        options: field.getOptions(),
      });
    }
  }
  return fields;
}

/**
 * Writes field values into the document and returns the new source.
 * With `flatten`, fields are merged into the page content and stop being editable.
 */
export async function applyFormValues(
  sourceBase64: string,
  values: Record<string, FormValue>,
  { flatten = false } = {},
): Promise<string> {
  const doc = await PDFDocument.load(sourceBase64, { ignoreEncryption: true });
  const form = doc.getForm();
  const fonts = new Map<StandardFonts, PDFFont>();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField) {
      field.setText(typeof value === 'string' && value !== '' ? value : undefined);
      // Redraw in the field's own font; pdf-lib would otherwise use Helvetica.
      const standard = standardFontFor(field.acroField.getDefaultAppearance());
      if (standard) {
        let font = fonts.get(standard);
        if (!font) fonts.set(standard, (font = await doc.embedFont(standard)));
        field.updateAppearances(font);
      }
    } else if (field instanceof PDFCheckBox) {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (typeof value === 'string') field.select(value);
      else field.clear();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string') field.select(value);
      else field.clear();
    }
  }
  if (flatten) form.flatten();
  return doc.saveAsBase64();
}
