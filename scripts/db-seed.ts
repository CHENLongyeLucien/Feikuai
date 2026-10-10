import {loadConfig} from '../apps/api/src/config.js';
import {openDatabase} from '../apps/api/src/db/database.js';
import {seed} from '../apps/api/src/db/seed.js';
const c=loadConfig();const {db}=openDatabase(c.DATABASE_PATH);const r=seed(db,c);console.log(`Seeded ${r.payables.length} synthetic payables and ${r.suppliers.length} suppliers idempotently. Invoice keys preserved.`);db.close();
