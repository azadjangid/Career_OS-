import { Router } from 'express';
import { resumesController } from './resumes.controller';
import { authenticate } from '../../middleware/auth';
import multer from 'multer';
import path from 'path';
import { env } from '../../config/env';

const upload = multer({
  dest: env.STORAGE_LOCAL_PATH,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

const router = Router();
router.use(authenticate);

router.get('/', resumesController.listResumes);
router.post('/', upload.single('file'), resumesController.uploadResume);
router.get('/:id', resumesController.getResume);
router.get('/:id/preview', resumesController.getPreview);
router.post('/:id/duplicate', resumesController.duplicateResume);
router.post('/:id/parse', resumesController.parseResume);
router.put('/:id', resumesController.updateResume);
router.delete('/:id', resumesController.deleteResume);
router.post('/:id/set-default', resumesController.setDefault);
router.get('/:id/versions', resumesController.getVersions);

export default router;
