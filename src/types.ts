export interface PrintJob {
  id: string;
  sessionId: string;
  imageData: string;
  createdAt?: any; // Firebase Timestamp
  status: 'pending' | 'printed' | 'cancelled';
  fileName?: string;
  fileSize?: string;
}

export type ViewMode = 'loading' | 'host' | 'mobile';
