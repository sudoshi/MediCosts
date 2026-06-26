import multer from 'multer';
import path from 'node:path';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt']);
const ALLOWED_MIME_PREFIXES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

const medicalDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeAllowed = ALLOWED_MIME_PREFIXES.includes(file.mimetype);
    if (ALLOWED_EXTENSIONS.has(ext) && mimeAllowed) return cb(null, true);
    cb(new Error(`File type ${ext || file.mimetype} not supported. Allowed: PDF, PNG, JPG, TXT.`));
  },
});

export default medicalDocumentUpload;
