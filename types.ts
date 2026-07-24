export enum AppStep {
  LOOK_SETUP = 'LOOK_SETUP',
  LOOK_SUMMARY = 'LOOK_SUMMARY',
  SCAN_UPC = 'SCAN_UPC',
  PRODUCT_PHOTO = 'PRODUCT_PHOTO',
  REVIEW_ITEM = 'REVIEW_ITEM'
}

export interface User {
  name: string;
  email: string;
  picture: string;
}

export interface LookItem {
  id: string;
  upcCode: string;
  productImage: string;
  itemIndex: number;
  fileName: string;
  createdAt: number;
}

export interface AppState {
  step: AppStep;
  lookNumber: string;
  lookItems: LookItem[];
  upcCode: string | null;
  upcImage: string | null;
  productImage: string | null;
  isProcessing: boolean;
  processingMessage: string;
  error: string | null;
  user?: User | null;
}
