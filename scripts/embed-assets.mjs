import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const files=['index.html','release.css','boot.js','platform.js','gamedistribution.js','coop-config.js','colyseus-sdk.js','game.js','expedition.js','multiplayer.js'];
const assets={};
for(const file of files)assets[`/${file}`]=fs.readFileSync(path.join(root,'game-assets',file)).toString('base64');
const template=fs.readFileSync(path.join(root,'worker/index.template.js'),'utf8');
fs.writeFileSync(path.join(root,'worker/index.js'),template.replace('__EMBEDDED_ASSETS__',JSON.stringify(assets)));
