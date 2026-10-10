import {loadConfig} from '../apps/api/src/config.js';
import {openDatabase} from '../apps/api/src/db/database.js';
const {db}=openDatabase(loadConfig().DATABASE_PATH);console.log('Database migration 1 applied; WAL, foreign keys, synchronous FULL.');db.close();
