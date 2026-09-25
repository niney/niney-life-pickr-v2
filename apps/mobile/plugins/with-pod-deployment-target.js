// Xcode 27 은 배포 대상(IPHONEOS_DEPLOYMENT_TARGET)이 지원 범위(15.0~) 밖인 Pod 타깃을 경고가 아니라
// 오류로 막는다 — SDWebImage(9.0)·RNCAsyncStorage 리소스 번들(13.4) 등 오래된 podspec 이 그대로 걸린다.
// Xcode 에서 손으로 올려도 `pod install` 이 Pods.xcodeproj 를 다시 만들면 되돌아가므로, 앱과 같은 배포
// 대상(Podfile `platform :ios`, 기본 15.1)보다 낮은 Pod 타깃만 그 값으로 끌어올린다.
//
// `expo prebuild` 가 Podfile 을 재생성해도 이 플러그인이 다시 패치한다(with-swift-concurrency-fix 와 같은 방식).

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# @pod-deployment-target-fix';

const SNIPPET = `
    ${MARKER}
    app_target = (podfile_properties['ios.deploymentTarget'] || '15.1')
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        current = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new(app_target)
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_target
        end
      end
    end
`;

function patchPodfile(contents) {
  if (contents.includes(MARKER)) return contents;

  // Expo 기본 Podfile 의 `react_native_post_install(...)` 다음 줄에 삽입 — 괄호 깊이로 닫는 `)` 를 찾는다.
  const call = 'react_native_post_install(';
  const start = contents.indexOf(call);
  if (start === -1) {
    throw new Error('with-pod-deployment-target: Podfile 에서 react_native_post_install 호출을 찾지 못함');
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
    throw new Error('with-pod-deployment-target: 괄호 짝을 못 맞춤');
  }
  return contents.slice(0, i) + '\n' + SNIPPET + contents.slice(i);
}

module.exports = function withPodDeploymentTarget(config) {
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
