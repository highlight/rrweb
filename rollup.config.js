import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';
import renameNodeModules from 'rollup-plugin-rename-node-modules';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';
import pkg from './package.json';

function toRecordPath(path) {
  return path
    .replace(/^([\w]+)\//, '$1/record/')
    .replace('rrweb', 'rrweb-record');
}

function toRecordPackPath(path) {
  return path
    .replace(/^([\w]+)\//, '$1/record/')
    .replace('rrweb', 'rrweb-record-pack');
}

function toReplayPath(path) {
  return path
    .replace(/^([\w]+)\//, '$1/replay/')
    .replace('rrweb', 'rrweb-replay');
}

function toReplayUnpackPath(path) {
  return path
    .replace(/^([\w]+)\//, '$1/replay/')
    .replace('rrweb', 'rrweb-replay-unpack');
}

function toAllPath(path) {
  return path.replace('rrweb', 'rrweb-all');
}

function toPluginPath(pluginName, stage) {
  return (path) =>
    path
      .replace(/^([\w]+)\//, '$1/plugins/')
      .replace('rrweb', `${pluginName}-${stage}`);
}

function toMinPath(path) {
  return path.replace(/\.js$/, '.min.js');
}

const baseConfigs = [
  // all in one
  {
    input: './src/entries/all.ts',
    name: 'rrweb',
    pathFn: toAllPath,
    esm: true,
  },
  // record only
  {
    input: './src/record/index.ts',
    name: 'rrwebRecord',
    pathFn: toRecordPath,
  },
  // record and pack
  {
    input: './src/entries/record-pack.ts',
    name: 'rrwebRecord',
    pathFn: toRecordPackPath,
  },
  // replay only
  {
    input: './src/replay/index.ts',
    name: 'rrwebReplay',
    pathFn: toReplayPath,
  },
  // replay and unpack
  {
    input: './src/entries/replay-unpack.ts',
    name: 'rrwebReplay',
    pathFn: toReplayUnpackPath,
  },
  // record and replay
  {
    input: './src/index.ts',
    name: 'rrweb',
    pathFn: (p) => p,
  },
  // plugins
  {
    input: './src/plugins/console/record/index.ts',
    name: 'rrwebConsoleRecord',
    pathFn: toPluginPath('console', 'record'),
  },
  {
    input: './src/plugins/console/replay/index.ts',
    name: 'rrwebConsoleReplay',
    pathFn: toPluginPath('console', 'replay'),
  },
];

let configs = [];

for (const c of baseConfigs) {
  const loader = webWorkerLoader();
  const basePlugins = [resolve({ browser: true }), loader, typescript()];
  const plugins = basePlugins.concat(
    postcss({
      extract: false,
      inject: false,
    }),
  );
  console.log('pkg', pkg);
  // browser
  configs.push({
    input: c.input,
    plugins,
    output: [
      {
        name: c.name,
        format: 'iife',
        file: c.pathFn(pkg.unpkg),
      },
    ],
  });
  console.log('ok1');
  // browser + minify
  configs.push({
    input: c.input,
    plugins: basePlugins.concat(
      postcss({
        extract: true,
        minimize: true,
        sourceMap: true,
      }),
      terser(),
    ),
    output: [
      {
        name: c.name,
        format: 'iife',
        file: toMinPath(c.pathFn(pkg.unpkg)),
        sourcemap: true,
      },
    ],
  });
  console.log('ok2');
  // CommonJS
  configs.push({
    input: c.input,
    plugins,
    output: [
      {
        format: 'cjs',
        file: c.pathFn('lib/rrweb.js'),
      },
    ],
  });
  if (c.esm) {
    // ES module
    configs.push({
      input: c.input,
      plugins,
      preserveModules: true,
      output: [
        {
          format: 'esm',
          dir: 'es/rrweb',
          plugins: [renameNodeModules('ext')],
        },
      ],
    });
  }
  console.log('out!');
}

if (process.env.BROWSER_ONLY) {
  const browserOnlyBaseConfigs = [
    {
      input: './src/index.ts',
      name: 'rrweb',
      pathFn: (p) => p,
    },
    {
      input: './src/plugins/console/record/index.ts',
      name: 'rrwebConsoleRecord',
      pathFn: toPluginPath('console', 'record'),
    },
  ];

  configs = [];

  for (const c of browserOnlyBaseConfigs) {
    const loader = webWorkerLoader();
    console.log('zanetest', loader);

    const plugins = [
      resolve({ browser: true }),
      loader,
      typescript(),
      postcss({
        extract: false,
        inject: false,
        sourceMap: true,
      }),
      terser(),
    ];

    configs.push({
      input: c.input,
      plugins,
      output: [
        {
          name: c.name,
          format: 'iife',
          file: toMinPath(c.pathFn(pkg.unpkg)),
          sourcemap: true,
        },
      ],
    });
  }
  console.log('out 2!');
}

export default configs;
