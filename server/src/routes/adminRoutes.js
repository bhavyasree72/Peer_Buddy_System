const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken, requireRole('admin'));

router.get('/dashboard', adminController.getAdminDashboard);
router.get('/users', adminController.getUsers);
router.post('/users/create', adminController.createUser);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.post('/users/bulk-import', adminController.bulkImportUsers);
router.get('/reports', adminController.getReports);
router.post('/reports/:reportId/action', adminController.handleReportAction);
router.get('/audit-log', adminController.getAuditLog);
router.post('/settings', adminController.updateSettings);
router.post('/skills', adminController.createMasterSkill);
router.get('/master-data', adminController.getMasterDataAll);
router.post('/master-data', adminController.addMasterItem);
router.delete('/master-data', adminController.deleteMasterItem);
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', adminController.saveAnnouncement);
router.post('/email-diagnostic', adminController.sendEmailDiagnostic);
router.post('/allocate-student', adminController.allocateStudentMentor);

module.exports = router;
