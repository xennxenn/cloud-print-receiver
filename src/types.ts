export interface PrintJob {
  id: string;
  sessionId: string;
  imageData: string; // Contains Base64 data URL OR file stream URL (e.g. /api/files/...)
  createdAt?: any; // Firebase Timestamp
  status: 'pending' | 'printed' | 'cancelled';
  fileName?: string;
  fileSize?: string;
  fileType: 'image' | 'document' | 'other';
  mimeType?: string; // e.g. 'application/pdf', 'text/plain', 'image/jpeg'
  senderName?: string;
}

export type ViewMode = 'loading' | 'home' | 'host' | 'mobile';
