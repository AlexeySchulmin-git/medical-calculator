import esbuild from 'esbuild';

// Production build
esbuild.build({
  entryPoints: ['src/widget/index.jsx'],
  bundle: true,
  minify: true,
  outfile: 'public/widget-calculator.js',
  format: 'iife',
  globalName: 'MedicalCalculatorWidget',
  loader: { '.jsx': 'jsx' },
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.PREACT_DEVTOOLS': 'false'
  },
  plugins: [
    {
      name: 'preact-compat',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => {
          return { path: 'preact/compat' };
        });
        build.onResolve({ filter: /^react-dom$/ }, () => {
          return { path: 'preact/compat' };
        });
      }
    }
  ]
}).catch(() => process.exit(1));
