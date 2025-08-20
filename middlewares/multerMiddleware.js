import multer from "multer";
import CustomError from "../utilities/CustomError.js";
import fs from 'fs';

// Limits
const LIMITS = {
  basic: { image: 2 * 1024 * 1024, video: 50 * 1024 * 1024 },//2mb and 50mb
  premium: { image: 5 * 1024 * 1024, video: 200 * 1024 * 1024 }//5mb and 200mb
};

// Allowed types
const FILE_TYPES = {
  image: /jpeg|jpg|png|webp/,
  video: /mp4|webm|mov/
};

// Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/temp'),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// File filter
const fileFilter = (allowed) => (req, file, cb) => {
  const ext = file.originalname.toLowerCase().split('.').pop();
  const type = file.mimetype.split('/')[0];

  if (allowed.includes(type) && FILE_TYPES[type]?.test(ext)) return cb(null, true);
  cb(new CustomError(`Only ${allowed.join('/')} files are allowed`, 400));
};



// Profile upload (avatar & cover)
export const uploadUserProfile = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 },//1mb
  fileFilter: fileFilter(['image'])
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

// Post media upload (image/video)
export const uploadPostMedia = (req, res, next) => {
  const premiumActive = req.user?.premium?.isActive;
    const upload = multer({
    storage,
    limits: {
      files: premiumActive ? 8 : 4 // Max number of files
    },
    fileFilter: (req, file, cb) => {
      const type = file.mimetype.split('/')[0];
      const ext = file.originalname.toLowerCase().split('.').pop();

      // Check file type
      if (!['image', 'video'].includes(type)) {
        return cb(new CustomError('Only image and video files are allowed', 400));
      }

      // Check file extension
      if (!FILE_TYPES[type]?.test(ext)) {
        return cb(new CustomError(`Invalid ${type} file format`, 400));
      }

      // Set file size limit based on type
      const maxSize = type === 'image'
        ? (premiumActive ? LIMITS.premium.image : LIMITS.basic.image)
        : (premiumActive ? LIMITS.premium.video : LIMITS.basic.video);

      // Store the size limit for this file to use in size check
      file.sizeLimit = maxSize;

      cb(null, true);
    }
  }).array('media', premiumActive ? 8 : 4);
  // Handle upload
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new CustomError(
          `Too many files. ${premiumActive ? 'Premium' : 'Basic'} users can upload up to ${premiumActive ? 8 : 4} files`, 400
        ));
      }
      return next(new CustomError(err.message, 400));
    }
    if (err) {
      return next(new CustomError(err.message, 400));
    }

    // Check each file's size after upload
    if (req.files) {
      for (const file of req.files) {
        const type = file.mimetype.split('/')[0];
        const maxSize = type === 'image' 
          ? (premiumActive ? LIMITS.premium.image : LIMITS.basic.image)
          : (premiumActive ? LIMITS.premium.video : LIMITS.basic.video);

        if (file.size > maxSize) {
          // Delete all uploaded files if any file is too large
          req.files.forEach(f => {
            try {
              fs.unlinkSync(f.path);
            } catch (e) {
              console.error('Error deleting file:', e);
            }
          });

          return next(new CustomError(
            `File "${file.originalname}" is too large. ${type === 'image' 
              ? `Images must be under ${maxSize / (1024 * 1024)}MB` 
              : `Videos must be under ${maxSize / (1024 * 1024)}MB`}`, 400
          ));
        }
      }
    }
    
    next();
  });
};

// Chat image upload (max 4 images)
export const uploadChatImages = (req, res, next) => {
  const upload = multer({
    storage,
    limits: {
      files: 4 // Max 4 images per message
    },
    fileFilter: (req, file, cb) => {
      const type = file.mimetype.split('/')[0];
      const ext = file.originalname.toLowerCase().split('.').pop();
      
      // Only allow images
      if (type !== 'image') {
        return cb(new CustomError('Only image files are allowed in chat', 400));
      }

      // Check file extension
      if (!FILE_TYPES[type]?.test(ext)) {
        return cb(new CustomError('Invalid image format', 400));
      }

      // Set file size limit
      const maxSize = LIMITS.basic.image; // Using basic image limit for all users
      file.sizeLimit = maxSize;

      cb(null, true);
    }
  }).array('images', 4);

  // Handle upload
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(new CustomError('Maximum 4 images allowed per message', 400));
      }
      return next(new CustomError(err.message, 400));
    }
    if (err) {
      return next(new CustomError(err.message, 400));
    }

    // Check each file's size after upload
    if (req.files) {
      for (const file of req.files) {
        if (file.size > LIMITS.basic.image) {
          // Delete all uploaded files if any file is too large
          req.files.forEach(f => {
            try {
              fs.unlinkSync(f.path);
            } catch (e) {
              console.error('Error deleting file:', e);
            }
          });

          return next(new CustomError(
            `File "${file.originalname}" is too large. Images must be under ${LIMITS.basic.image / (1024 * 1024)}MB`, 
            400
          ));
        }
      }
    }
    
    next();
  });
};
