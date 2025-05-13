import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import CustomError from './CustomError.js';

// Configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

export const uploadOnCloudinary = async (localFilePath, folder = '', transformation = null) => {
    try {
        if (!localFilePath) return null;

        // Basic upload options
        const uploadOptions = {
            resource_type: "auto",
            folder: folder
        };

        // Add transformation if provided
        if (transformation) {
            uploadOptions.transformation = transformation;
        }

        // Upload file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, uploadOptions);

        // Remove file from local server
        fs.unlink(localFilePath, (err) => {
            if (err) console.log("Error deleting local file:", err);
        });

        return response;

    } catch (error) {
        // Remove file from local server on failure
        fs.unlink(localFilePath, (err) => {
            if (err) console.log("Error deleting local file:", err);
        });
        throw new CustomError("Error uploading file to cloudinary", 500);
    }
};

export const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return null;
        const response = await cloudinary.uploader.destroy(publicId);
        return response;
    } catch (error) {
        throw new CustomError("Error deleting file from cloudinary", 500);
    }
};