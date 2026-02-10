/**
 * Download utilities for agent-board CLI.
 *
 * Handles fetching JSON manifests, downloading files with progress,
 * and verifying SHA-256 checksums. Uses only Node.js built-ins.
 */

import { get as httpsGet } from 'node:https';
import { createWriteStream, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Will be replaced with the real Cloudflare R2 public bucket URL
export const R2_BASE_URL = 'https://pub-3e8e5cea43b3427fa24870c7a04e46dd.r2.dev';

/**
 * Fetch JSON from a URL. Follows redirects (up to 5).
 * @param {string} url
 * @returns {Promise<any>}
 */
export function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    let redirects = 0;

    const follow = (targetUrl) => {
      if (redirects++ > 5) {
        return reject(new Error('Too many redirects'));
      }

      httpsGet(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }

        if (res.statusCode !== 200) {
          // Consume response to free the socket
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }

        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
          }
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

/**
 * Download a file to disk with optional progress callback. Follows redirects.
 * @param {string} url
 * @param {string} dest  Absolute path to write to
 * @param {(downloaded: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    let redirects = 0;

    const follow = (targetUrl) => {
      if (redirects++ > 5) {
        return reject(new Error('Too many redirects'));
      }

      httpsGet(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const file = createWriteStream(dest);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress) {
            onProgress(downloadedBytes, totalBytes);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve());
        });

        file.on('error', (err) => {
          file.close();
          reject(err);
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

/**
 * Verify that a file matches an expected SHA-256 hex digest.
 * @param {string} filePath
 * @param {string} expectedHash  Lowercase hex string
 * @returns {boolean}
 */
export function verifySHA256(filePath, expectedHash) {
  const fileBuffer = readFileSync(filePath);
  const actualHash = createHash('sha256').update(fileBuffer).digest('hex');
  return actualHash === expectedHash.toLowerCase();
}
