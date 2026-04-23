import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI not set; skipping MongoDB connection");
      return;
    }

    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");
    console.log(`Host: ${conn.connection.host}`);
    console.log(`DB Name: ${conn.connection.name}`);
  } catch (error) {
    console.error("MongoDB Connection Error:", error?.message || error);
    process.exit(1);
  }
};
