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

  // three 는 한 벌만. react-three-fiber 앱판(CJS)은 require('three') 라 exports 의 "require" 조건으로 three.cjs 를,
  // 우리 코드의 ESM import 는 "import" 조건으로 three.module.js 를 따로 올려 사본이 둘이 된다 — R3F 가 덧대는 텍스처
  // 로더 폴리필이 한쪽에만 걸려 `document` 오류가 나고, 번들도 1MB 넘게 늘어난다. 항상 require 조건으로 푼다.
  if (moduleName === 'three') {
    const cjsContext = { ...context, isESMImport: false };
    return upstreamResolveRequest
      ? upstreamResolveRequest(cjsContext, moduleName, platform)
      : context.resolveRequest(cjsContext, moduleName, platform);
  }

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
