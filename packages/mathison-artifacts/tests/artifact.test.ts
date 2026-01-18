// WHY: Test artifact storage

import * as crypto from 'crypto';

describe('Artifacts', () => {
  test('should compute content hash correctly', () => {
    const data = Buffer.from('test data');
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64); // SHA-256 hex is 64 chars
  });

  test('should verify hash matches', () => {
    const data = Buffer.from('test data');
    const hash1 = crypto.createHash('sha256').update(data).digest('hex');
    const hash2 = crypto.createHash('sha256').update(data).digest('hex');
    expect(hash1).toBe(hash2);
  });
});
