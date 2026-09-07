import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createIndexes } from './models/index.js';
await mongoose.connect(env.MONGODB_URI, { autoIndex: false });
await createIndexes();
await mongoose.disconnect();
