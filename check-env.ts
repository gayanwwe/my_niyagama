import { execSync } from 'child_process';

try {
  const phpVersion = execSync('php -v').toString();
  console.log('PHP Version:', phpVersion);
} catch (e) {
  console.error('PHP not found');
}

try {
  const composerVersion = execSync('composer -v').toString();
  console.log('Composer Version:', composerVersion);
} catch (e) {
  console.error('Composer not found');
}
