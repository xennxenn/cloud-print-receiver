export interface PrintJob {
  id: string;
  sessionId: string;
  imageData: string; // Contains Base64 of image OR generic file content
  createdAt?: any; // Firebase Timestamp
  status: 'pending' | 'printed' | 'cancelled';
  fileName?: string;
  fileSize?: string;
  fileType: 'image' | 'document' | 'other';
  mimeType?: string; // e.g. 'application/pdf', 'text/plain'
}

export type ViewMode = 'loading' | 'home' | 'host' | 'mobile';
