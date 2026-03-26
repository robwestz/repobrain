/**
 * Download tree-sitter WASM grammar files for supported languages.
 *
 * Usage: npx tsx scripts/download-grammars.ts
 *
 * Downloads pre-built .wasm grammar files from the tree-sitter playground
 * CDN and places them in the `grammars/` directory at project root.
 *
 * Languages: JavaScript, TypeScript (TSX), Python, Go, Rust, Java
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

const GRAMMARS_DIR = path.join(process.cwd(), "grammars");

// Pre-built grammar sources (GitHub releases)
const GRAMMAR_URLS: Record<string, string> = {
  "tree-sitter-javascript.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-javascript.wasm",
  "tree-sitter-tsx.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-tsx.wasm",
  "tree-sitter-typescript.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-typescript.wasm",
  "tree-sitter-python.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-python.wasm",
  "tree-sitter-go.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-go.wasm",
  "tree-sitter-rust.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-rust.wasm",
  "tree-sitter-java.wasm":
    "https://github.com/nicolo-ribaudo/nicolo-tree-sitter-wasm-prebuilt/raw/main/tree-sitter-java.wasm",
};

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (followUrl: string) => {
      https
        .get(followUrl, (response) => {
          // Handle redirect
          if (response.statusCode === 301 || response.statusCode === 302) {
            const location = response.headers.location;
            if (location) {
              request(location);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            return;
          }

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
    };
    request(url);
  });
}

async function main() {
  // Ensure grammars directory exists
  if (!fs.existsSync(GRAMMARS_DIR)) {
    fs.mkdirSync(GRAMMARS_DIR, { recursive: true });
  }

  console.log(`Downloading tree-sitter WASM grammars to ${GRAMMARS_DIR}\n`);

  for (const [filename, url] of Object.entries(GRAMMAR_URLS)) {
    const dest = path.join(GRAMMARS_DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`  [skip] ${filename} (already exists)`);
      continue;
    }

    try {
      process.stdout.write(`  [download] ${filename}...`);
      await download(url, dest);
      const stats = fs.statSync(dest);
      console.log(` OK (${(stats.size / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.log(` FAILED: ${err}`);
      console.log(`    You can manually download from: ${url}`);
    }
  }

  console.log("\nDone. Tree-sitter WASM grammars are ready.");
  console.log("Note: The ingestion pipeline will fall back to regex-based extraction");
  console.log("for any languages where the grammar file is not available.");
}

main().catch(console.error);
