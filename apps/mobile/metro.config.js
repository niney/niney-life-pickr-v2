const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  // pnpm hoists undeclared transitive deps (e.g. expo-router → debug,
  // react-helmet-async) into this private folder. Metro needs to see it
  // because we use `disableHierarchicalLookup = true`.
  path.resolve(workspaceRoot, 'node_modules/.pnpm/node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

config.resolver.blockList = [
  /[\\/]\.claude[\\/].*/,
  /[\\/]\.git[\\/].*/,
  /[\\/]\.turbo[\\/].*/,
  /[\\/]\.expo[\\/].*/,
];

// `@repo/*` workspace packages are consumed as raw TS source but use
// Node ESM-style `.js` import suffixes (required when `"type": "module"`
// + TS NodeNext). Map those `.js` requests onto the real `.ts`/`.tsx`
// source so Metro can resolve them.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = upstreamResolveRequest
    ? (name) => upstreamResolveRequest(context, name, platform)
    : (name) => context.resolveRequest(context, name, platform);

  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    // Try platform-specific extensions first so `.native.tsx` / `.ios.tsx` /
    // `.android.tsx` variants are picked over the bare `.tsx` (which often
    // re-exports the `.web` build).
    const platformExts =
      platform === 'ios'
        ? ['.ios.tsx', '.ios.ts', '.native.tsx', '.native.ts']
        : platform === 'android'
          ? ['.android.tsx', '.android.ts', '.native.tsx', '.native.ts']
          : platform === 'web'
            ? ['.web.tsx', '.web.ts']
            : [];
    for (const ext of [...platformExts, '.tsx', '.ts']) {
      try {
        return next(moduleName.replace(/\.js$/, ext));
      } catch {
        // try next extension
      }
    }
  }
  return next(moduleName);
};

module.exports = config;
