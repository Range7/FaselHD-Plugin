// build.js — bundle only the 111477 provider into a single Hermes-safe file in
// providers/, matching the Nuvio shipped format: CommonJS, async transpiled to
// generators (esbuild target=es2015), _lib requires inlined.
const esbuild = require('esbuild');
const fs = require('fs');

// Only 111477 provider is needed now.
const PROVIDERS = [
  'a111477', // 111477 provider
];

fs.mkdirSync('providers', { recursive: true });

(async () => {
  for (const name of PROVIDERS) {
    await esbuild.build({
      entryPoints: [`src/${name}.js`],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'es2015', // lowers async/await -> generator + Promise helper (Hermes-safe)
      outfile: `providers/${name}.js`,
      legalComments: 'none',
      logLevel: 'info',
    });
  }
  console.log('Built:', PROVIDERS.map((p) => `providers/${p}.js`).join(', '));
})();
