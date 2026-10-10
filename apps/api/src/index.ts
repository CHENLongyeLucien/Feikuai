import {buildApp} from './app.js';
const {app,config}=await buildApp({logger:true});await app.listen({host:config.API_HOST,port:config.API_PORT});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
