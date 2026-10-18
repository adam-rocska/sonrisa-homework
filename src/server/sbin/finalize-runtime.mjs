import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import process from 'node:process';

function isWithin(root, target) {
  const path = relative(root, target);
  return !isAbsolute(path) && path.split(sep)[0] !== '..';
}

function finalize(directory) {
  const root = realpathSync(directory);
  const manifest = join(root, 'package.json');
  if (
    !lstatSync(manifest).isFile() ||
    JSON.parse(readFileSync(manifest, 'utf8')).name !== '@signalpost/server'
  ) {
    throw new Error('Expected an isolated @signalpost/server deployment directory.');
  }

  // pnpm 10 legacy deploy retains a self-reference to the source workspace.
  // Localize only that known package link; all other escapes must fail the build.
  const self = join(root, 'node_modules/.pnpm/node_modules/@signalpost/server');
  const selfStat = lstatSync(self, { throwIfNoEntry: false });
  let localized = false;
  if (selfStat !== undefined) {
    if (!selfStat.isSymbolicLink() || !isWithin(root, realpathSync(dirname(self)))) {
      throw new Error('The known package self-reference is not an internal symlink entry.');
    }
    unlinkSync(self);
    symlinkSync(relative(dirname(self), root), self);
    localized = true;
  }

  let symlinks = 0;
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (!isWithin(root, realpathSync(path))) {
          throw new Error(`Deployment symlink escapes the artifact: ${relative(root, path)}`);
        }
        symlinks += 1;
      } else if (entry.isDirectory()) {
        directories.push(path);
      }
    }
  }
  return { status: 'verified', symlinks, selfReferenceLocalized: localized };
}

try {
  if (process.argv.length !== 3) {
    throw new Error('Usage: node finalize-runtime.mjs <deployment-directory>');
  }
  process.stdout.write(`${JSON.stringify(finalize(process.argv[2]))}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Runtime finalization failed.'}\n`,
  );
  process.exitCode = 1;
}
