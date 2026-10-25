const multer = require('multer');
const path = require('path');

// Memory storage keeps file buffer in memory for uploading directly to Supabase Storage
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowedExts = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.ppt', '.pptx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Allowed formats: PDF, DOCX, PPT, PNG, JPG.'));
  }
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;
