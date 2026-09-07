import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
try {
  await writeFile(
    new URL('../.env', import.meta.url),
    example.replace(
      'replace-with-a-random-secret-of-at-least-48-characters',
      randomBytes(64).toString('hex'),
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    '.env local criado com chave aleatória. Configure MongoDB e TURN antes de usar em produção.',
  );
} catch (e) {
  if (e.code === 'EEXIST') console.log('.env existente preservado.');
  else throw e;
}
