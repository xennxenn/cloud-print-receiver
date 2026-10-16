import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Setup upload directory in /tmp for high-performance ephemeral storage
const UPLOAD_DIR = path.resolve('/tmp', 'cloud_print_uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// In-memory registry for uploaded file metadata
interface FileMetadata {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
}
const fileRegistry = new Map<string, FileMetadata>();

// Setup Multer for up to 220MB files
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `file_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 220 * 1024 * 1024, // 220MB limit (exceeds the 200MB requirement)
  }
});

// JSON and URL-encoded body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS headers for broad device interoperability
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Upload endpoint
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'ขนาดไฟล์เกินกำหนด (สูงสุดไม่เกิน 200MB)' });
      }
      return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'ไม่พบไฟล์ที่เลือก' });
    }

    const fileId = path.parse(req.file.filename).name;
    const metadata: FileMetadata = {
      id: fileId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      uploadedAt: Date.now()
    };

    fileRegistry.set(fileId, metadata);

    // Save metadata json file alongside for persistence across worker restarts if needed
    try {
      fs.writeFileSync(
        path.join(UPLOAD_DIR, `${fileId}.meta.json`), 
        JSON.stringify(metadata)
      );
    } catch (e) {
      console.warn('Could not save metadata file:', e);
    }

    return res.json({
      success: true,
      fileId,
      fileUrl: `/api/files/${fileId}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: metadata.mimeType
    });
  });
});

// Download / Stream file endpoint
app.get('/api/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  let metadata = fileRegistry.get(fileId);

  // If not in memory, try reading from disk metadata
  if (!metadata) {
    const metaPath = path.join(UPLOAD_DIR, `${fileId}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (metadata) fileRegistry.set(fileId, metadata);
      } catch (e) {
        console.warn('Failed reading metadata:', e);
      }
    }
  }

  // Find physical file in upload dir
  let filePath = '';
  if (metadata) {
    filePath = path.join(UPLOAD_DIR, metadata.storedName);
  } else {
    // Search directory by prefix
    const files = fs.readdirSync(UPLOAD_DIR);
    const matched = files.find(f => f.startsWith(fileId) && !f.endsWith('.meta.json'));
    if (matched) {
      filePath = path.join(UPLOAD_DIR, matched);
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ไม่พบไฟล์ หรือไฟล์หมดอายุแล้ว' });
  }

  const filename = metadata?.originalName || path.basename(filePath);
  const mimeType = metadata?.mimeType || 'application/octet-stream';

  // Set friendly headers
  res.setHeader('Content-Type', mimeType);
  
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  }

  res.sendFile(filePath);
});

// Delete file endpoint
app.delete('/api/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  const metadata = fileRegistry.get(fileId);
  fileRegistry.delete(fileId);

  try {
    if (metadata) {
      const p = path.join(UPLOAD_DIR, metadata.storedName);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const metaP = path.join(UPLOAD_DIR, `${fileId}.meta.json`);
    if (fs.existsSync(metaP)) fs.unlinkSync(metaP);
  } catch (e) {
    console.warn('Error deleting file:', e);
  }

  res.json({ success: true });
});

// Periodic cleanup of files older than 24 hours
setInterval(() => {
  try {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const f of files) {
      const fullPath = path.join(UPLOAD_DIR, f);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (e) {
    console.error('Cleanup error:', e);
  }
}, 60 * 60 * 1000);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
