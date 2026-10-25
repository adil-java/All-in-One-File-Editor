import { requireOptionalNativeModule } from 'expo';

export type IndexedDocument = {
  uri: string;
  /** Absolute file path, when MediaStore has one. */
  path: string | null;
  name: string;
  size: number;
  /** Milliseconds since epoch. */
  modified: number;
};

type DeviceDocumentsModule = {
  listDocuments(extensions: string[]): Promise<IndexedDocument[]>;
};

/** Android only, and only in builds that include this module (not Expo Go). */
export default requireOptionalNativeModule<DeviceDocumentsModule>('DeviceDocuments');
