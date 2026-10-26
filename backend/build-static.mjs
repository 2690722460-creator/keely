import { cpSync, mkdirSync, rmSync, lstatSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, basename, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public');
if (dirname(output) !== root || basename(output) !== 'public') throw Error('Invalid generated output path');
if (lstatSync(output, {throwIfNoEntry:false})?.isSymbolicLink()) throw Error('Generated output must not be a symlink');
// Only the verified, dedicated generated public directory is cleared.
rmSync(output, {recursive:true, force:true});
mkdirSync(output);
cpSync(join(root,'index.html'), join(output,'index.html'));
cpSync(join(root,'assets'), join(output,'assets'), {recursive:true, filter:source=>!lstatSync(source).isSymbolicLink()});
cpSync(join(root,'admin'), join(output,'admin'), {recursive:true, filter:source=>!lstatSync(source).isSymbolicLink()});
const entries = readdirSync(output).sort();
if (entries.join(',') !== 'admin,assets,index.html') throw Error('Unexpected public file');
console.log('STATIC_BUILD_OK public=index.html,assets,admin secrets=excluded api=vercel-function');
