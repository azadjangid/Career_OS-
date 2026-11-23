import { Router } from 'express';
import { applicationsController as c } from './applications.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createApplicationSchema, updateApplicationSchema, bulkSchema, noteSchema } from './applications.schema';

const router = Router();
router.use(authenticate);

router.get('/', c.listApplications);
router.post('/', validate(createApplicationSchema), c.createApplication);
router.get('/stats', c.getStats);
router.post('/bulk/status', validate(bulkSchema), c.bulkUpdate);
router.post('/bulk/delete', validate(bulkSchema), c.bulkDelete);
router.get('/:id', c.getApplication);
router.put('/:id', validate(updateApplicationSchema), c.updateApplication);
router.delete('/:id', c.deleteApplication);
router.get('/:id/history', c.getStatusHistory);
router.post('/:id/notes', validate(noteSchema), c.addNote);
router.put('/:id/notes/:noteId', validate(noteSchema), c.updateNote);
router.delete('/:id/notes/:noteId', c.deleteNote);
router.post('/:id/interviews', c.addInterview);

export default router;
