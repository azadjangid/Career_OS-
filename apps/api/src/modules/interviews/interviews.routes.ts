import { Router } from 'express';
import { interviewsController as c } from './interviews.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { aiRateLimit } from '../../middleware/rateLimiter';
import { updateInterviewSchema, practiceQuestionsSchema, practiceAnswerSchema } from './interviews.schema';

const router = Router();
router.use(authenticate);

router.get('/', c.list);
router.get('/calendar.ics', c.calendarAll);
router.get('/:id', c.get);
router.put('/:id', validate(updateInterviewSchema), c.update);
router.delete('/:id', c.remove);
router.get('/:id/calendar.ics', c.calendarOne);

// Practice
router.post('/:id/practice', aiRateLimit, validate(practiceQuestionsSchema), c.practiceQuestions);
router.post('/:id/practice/:questionId/answer', aiRateLimit, validate(practiceAnswerSchema), c.answerQuestion);
router.delete('/:id/practice/:questionId', c.deleteQuestion);

export default router;
