import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { updateProfileSchema, addSkillSchema, addExperienceSchema, addEducationSchema, addProjectSchema } from './users.schema';

const router = Router();

router.use(authenticate);

// Profile
router.get('/profile', usersController.getProfile);
router.put('/profile', validate(updateProfileSchema), usersController.updateProfile);

// Skills
router.get('/profile/skills', usersController.getSkills);
router.post('/profile/skills', validate(addSkillSchema), usersController.addSkill);
router.put('/profile/skills/:id', usersController.updateSkill);
router.delete('/profile/skills/:id', usersController.deleteSkill);

// Experience
router.get('/profile/experience', usersController.getExperience);
router.post('/profile/experience', validate(addExperienceSchema), usersController.addExperience);
router.put('/profile/experience/:id', usersController.updateExperience);
router.delete('/profile/experience/:id', usersController.deleteExperience);

// Education
router.get('/profile/education', usersController.getEducation);
router.post('/profile/education', validate(addEducationSchema), usersController.addEducation);
router.put('/profile/education/:id', usersController.updateEducation);
router.delete('/profile/education/:id', usersController.deleteEducation);

// Projects
router.get('/profile/projects', usersController.getProjects);
router.post('/profile/projects', validate(addProjectSchema), usersController.addProject);
router.put('/profile/projects/:id', usersController.updateProject);
router.delete('/profile/projects/:id', usersController.deleteProject);

// Account
router.get('/account', usersController.getAccount);
router.put('/account', usersController.updateAccount);
router.put('/account/password', usersController.changePassword);
router.delete('/account', usersController.deleteAccount);

// Preferences
router.get('/preferences', usersController.getPreferences);
router.put('/preferences', usersController.updatePreferences);

// App settings, API key, data & privacy
router.get('/settings', usersController.getSettings);
router.put('/settings', usersController.updateSettings);
router.post('/api-key', usersController.createApiKey);
router.delete('/api-key', usersController.revokeApiKey);
router.get('/export', usersController.exportData);
router.delete('/data', usersController.deleteApplicationData);

export default router;
