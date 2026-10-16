/**
 * Utility functions for saving files to specific directories (File System Access API)
 * and forwarding/sharing files to other applications (Web Share API)
 */

export async function getJobBlob(imageDataOrUrl: string, mimeType?: string): Promise<Blob> {
  const res = await fetch(imageDataOrUrl);
  const blob = await res.blob();
  if (mimeType && (!blob.type || blob.type === 'application/octet-stream')) {
    return new Blob([blob], { type: mimeType });
  }
  return blob;
}

export async function saveFileWithPicker(
  blob: Blob,
  suggestedName: string,
  mimeType?: string
): Promise<{ success: boolean; canceled?: boolean; method: 'picker' | 'download' }> {
  // 1. Try modern File System Access API (Chrome, Edge, Opera, Samsung Internet)
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = suggestedName.includes('.') ? `.${suggestedName.split('.').pop()}` : '';
      const effectiveMime = mimeType || blob.type || 'application/octet-stream';
      
      const acceptMap: Record<string, string[]> = {};
      if (ext) {
        acceptMap[effectiveMime] = [ext];
      } else {
        acceptMap[effectiveMime] = [];
      }

      const handle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName || 'cloud-file',
        types: [
          {
            description: 'File',
            accept: acceptMap
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, method: 'picker' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, canceled: true, method: 'picker' };
      }
      console.warn('showSaveFilePicker failed, fallback to anchor tag:', err);
    }
  }

  // 2. Fallback to standard anchor download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'cloud-file';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { success: true, method: 'download' };
}

export async function shareFileToApps(
  blob: Blob,
  fileName: string,
  mimeType?: string
): Promise<{ success: boolean; canceled?: boolean; fallback?: boolean }> {
  const effectiveMime = mimeType || blob.type || 'application/octet-stream';
  const file = new File([blob], fileName, { type: effectiveMime });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: fileName,
        text: `ส่งไฟล์: ${fileName}`
      });
      return { success: true };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, canceled: true };
      }
      console.warn('navigator.share failed:', err);
    }
  }

  return { success: false, fallback: true };
}
