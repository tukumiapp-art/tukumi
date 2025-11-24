// server/controllers/upload.js
const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/errorResponse');

// Set storage engine
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Check File Type
function checkFileType(file, cb){
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const mimetype = filetypes.test(file.mimetype);

    if(mimetype && extname){
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

// Init upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 }, // 2MB limit
    fileFilter: function(req, file, cb){
        checkFileType(file, cb);
    }
}).single('image'); // 'image' is the name of the form field

exports.fileUpload = (req, res, next) => {
    upload(req, res, (err) => {
        if(err){
            return next(new ErrorResponse(err, 400));
        }
        if(!req.file){
            return next(new ErrorResponse('No file selected', 400));
        }

        // Return the path to the saved file
        res.status(200).json({
            success: true,
            msg: 'File uploaded successfully',
            filePath: `/uploads/${req.file.filename}`
        });
    });
};