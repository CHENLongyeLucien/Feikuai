import {loadConfig} from '../apps/api/src/config.js';
import {openDatabase} from '../apps/api/src/db/database.js';
import {seed} from '../apps/api/src/db/seed.js';
const c=loadConfig();const {db}=openDatabase(c.DATABASE_PATH);if(process.argv[2]==='seed'){const r=seed(db,c);console.log(`Seeded ${r.payables.length} synthetic payables, ${r.suppliers.length} suppliers; stable keys preserved.`);}else console.log('Migration 1 applied; foreign keys, WAL and synchronous FULL.');db.close();
