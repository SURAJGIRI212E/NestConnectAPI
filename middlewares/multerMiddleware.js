import multer from "multer";
import CustomError from "../utilities/CustomError.js";

// Limits
const LIMITS = {
  basic: { image: 1 * 1024 * 1024, video: 50 * 1024 * 1024 },//2mb and 50mb
  premium: { image: 5 * 1024 * 1024, video: 200 * 1024 * 1024 }
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

// Get size limit based on user type
const getLimit = (req, type) => {
  const premium = req.user?.premium;
  return premium ? LIMITS.premium[type] : LIMITS.basic[type];
};

// Profile upload (avatar & cover)
export const uploadUserProfile = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },//2mb
  fileFilter: fileFilter(['image'])
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

// Post media upload (image/video)
// export const uploadPostMedia = (req, res, next) => {
//   const premium = req.user?.premium;
//   const maxSize = getLimit(req, 'video');
//   const imageSize = getLimit(req, 'image');

//   multer({
//     storage,
//     limits: { fileSize: maxSize },
//     fileFilter: fileFilter(['image', 'video'])
//   }).array('media', premium ? 10 : 5)(req, res, (err) => {
//     if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
//       return next(new CustomError(
//         `File too large. ${premium ? 'Premium' : 'Basic'} users: Images up to ${imageSize / 1024 / 1024}MB, Videos up to ${maxSize / 1024 / 1024}MB`, 400));
//     }
//     if (err) return next(new CustomError(err.message, 400));
//     next();
//   });
// };
