import { Router } from 'express';
import { jobsController as c } from './jobs.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', c.listJobs);
router.get('/suggest', c.suggest);
router.get('/saved', c.getSavedJobs);
router.get('/sources', c.listSources);
router.post('/fetch', c.fetchJobs);
router.get('/searches', c.listSearches);
router.post('/searches', c.createSearch);
router.put('/searches/:searchId', c.updateSearch);
router.delete('/searches/:searchId', c.deleteSearch);
router.post('/', c.createJob);
router.get('/:id', c.getJob);
router.post('/:id/save', c.saveJob);
router.delete('/:id/save', c.unsaveJob);
router.get('/:id/match', c.getJobMatch);

export default router;
