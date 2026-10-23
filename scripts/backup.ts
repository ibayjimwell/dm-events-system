import 'dotenv/config';import {createBackup} from '../src/lib/backup';
createBackup().then(x=>{console.log('Encrypted backup uploaded:',x);process.exit(0);}).catch(e=>{console.error('Backup failed:',e.message);process.exit(1);});
