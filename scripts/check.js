import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
for(const dir of ['src','public','scripts','test'])for(const file of await readdir(dir))if(file.endsWith('.js'))execFileSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
console.log('JavaScript syntax checks passed.');
