import mongoose from 'mongoose';
import dotenv from 'dotenv';


dotenv.config();
// Connect to MongoDB

const connectDB = async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${process.env.DB_NAME}`)
       
        console.log("You successfully connected to MongoDB!");
      }     
      catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw new Error('Could not connect to MongoDB');
        process.exit(1)
      }
       
};

export default connectDB;