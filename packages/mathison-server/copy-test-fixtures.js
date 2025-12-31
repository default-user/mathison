/**
 * Copy test fixtures to dist directory after build
 * This ensures test genome files are available at runtime
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, 'src', '__tests__', 'fixtures');
const targetDir = path.join(__dirname, 'dist', '__tests__', 'fixtures');

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy all files from source to target
const files = fs.readdirSync(sourceDir);
files.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${file} to dist/__tests__/fixtures/`);
});

console.log('✓ Test fixtures copied successfully');
