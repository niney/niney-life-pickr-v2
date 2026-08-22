const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Expo SDK 52+ detects pnpm workspaces and configures watch folders and module
// search paths itself. Keep hierarchical lookup enabled so a package can load
// its own nested dependency version instead of an unrelated hoisted version
// from another workspace (for example Expo's webidl-conversions@5 rather than
// jsdom's Node-only webidl-conversions@8).

// Defer `require()` calls until first use. Cuts cold-start by lazily
// evaluating modules instead of all of them up front.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

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
