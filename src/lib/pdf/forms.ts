/**
 * Fillable form (AcroForm) fields: reading them for the form panel and writing
 * new values into the source document.
 */

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';

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
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    if (!field || field.isReadOnly()) continue;
    if (field instanceof PDFTextField) {
      field.setText(typeof value === 'string' && value !== '' ? value : undefined);
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
