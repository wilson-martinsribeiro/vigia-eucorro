// Gera JPGs minimos validos, simulando o Lightroom exportando aos poucos.
import fs from 'node:fs/promises';
import path from 'node:path';
const [ , , dir, de, ate, atrasoMs ] = process.argv;
// JPEG 1x1 valido
const JPG = Buffer.from(
 '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'+
 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'+
 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
await fs.mkdir(dir, { recursive: true });
for (let i = Number(de); i <= Number(ate); i++) {
  await fs.writeFile(path.join(dir, `furioso-wilson-lote-1-${i}.jpg`), JPG);
  if (Number(atrasoMs)) await new Promise(r => setTimeout(r, Number(atrasoMs)));
}
console.log(`gerados ${de}..${ate} em ${dir}`);
