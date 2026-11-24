import { Router } from 'express';
import { resumesController } from './resumes.controller';
import { authenticate } from '../../middleware/auth';
import multer from 'multer';
import path from 'path';
import { RESUME_TYPES } from '../../lib/resumeFiles';
import { AppError } from '../../middleware/errorHandler';
import { aiRateLimit } from '../../middleware/rateLimiter';

// Kept in memory (max 10 MB) so the real file type can be checked before anything is stored
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext in RESUME_TYPES) cb(null, true);
    else cb(new AppError('Only PDF and DOCX files are supported', 415, 'UNSUPPORTED_FILE'));
  },
});

const router = Router();
router.use(authenticate);

router.get('/', resumesController.listResumes);
router.post('/', upload.single('file'), resumesController.uploadResume);
router.get('/:id', resumesController.getResume);
router.get('/:id/preview', resumesController.getPreview);
router.get('/:id/file', resumesController.downloadFile);
router.post('/:id/duplicate', resumesController.duplicateResume);
router.post('/:id/parse', resumesController.parseResume);
router.put('/:id', resumesController.updateResume);
router.delete('/:id', resumesController.deleteResume);
router.post('/:id/set-default', resumesController.setDefault);
router.get('/:id/versions', resumesController.getVersions);
router.post('/:id/versions', resumesController.createVersion);
router.get('/:id/versions/:versionId', resumesController.getVersion);
router.post('/:id/versions/:versionId/restore', resumesController.restoreVersion);
router.get('/:id/compare', resumesController.compareVersions);
router.get('/:id/ats', resumesController.atsScore);
router.post('/:id/improve', aiRateLimit, resumesController.improveResume);

export default router;
