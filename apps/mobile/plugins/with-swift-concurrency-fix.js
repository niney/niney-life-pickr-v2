// Xcode 26 / Swift 6 toolchain은 strict concurrency 를 기본 적용해
// `static let center = Self()` 같은 코드(ExpoImage 등 다수의 Expo 모듈)에서
// 컴파일 에러가 난다. SDK 자체가 패치될 때까지 모든 Pod 타겟에
// SWIFT_VERSION=5.0 + SWIFT_STRICT_CONCURRENCY=minimal 을 주입한다.
//
// `expo prebuild` 가 Podfile 을 재생성해도 이 플러그인이 다시 패치한다.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# @swift-concurrency-fix';

const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['SWIFT_VERSION'] = '5.0'
        c.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      end
    end
`;

function patchPodfile(contents) {
  if (contents.includes(MARKER)) return contents;

  // Expo 기본 Podfile 의 `react_native_post_install(...)` 다음 줄에 삽입.
  // 괄호 깊이를 세서 닫는 `)` 위치를 찾는다 — 인자에 줄바꿈/중첩이 있어도 안전.
  const call = 'react_native_post_install(';
  const start = contents.indexOf(call);
  if (start === -1) {
    throw new Error(
      'with-swift-concurrency-fix: Podfile 에서 react_native_post_install 호출을 찾지 못함',
    );
  }
  let depth = 1;
  let i = start + call.length;
  while (i < contents.length && depth > 0) {
    const ch = contents[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    i++;
  }
  if (depth !== 0) {
    throw new Error('with-swift-concurrency-fix: 괄호 짝을 못 맞춤');
  }
  return contents.slice(0, i) + '\n' + SNIPPET + contents.slice(i);
}

module.exports = function withSwiftConcurrencyFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const before = await fs.promises.readFile(podfilePath, 'utf8');
      const after = patchPodfile(before);
      if (after !== before) {
        await fs.promises.writeFile(podfilePath, after, 'utf8');
      }
      return cfg;
    },
  ]);
};

module.exports.patchPodfile = patchPodfile;
module.exports.MARKER = MARKER;
