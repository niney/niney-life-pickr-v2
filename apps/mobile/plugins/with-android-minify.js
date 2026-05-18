// Release 빌드에서 R8 minify + 리소스 shrink 활성화.
// AAB 30~50% 감소 + 콜드 스타트 단축. 라이브러리 keep 룰은 각 AAR 의
// consumer-rules.pro 가 자동으로 합쳐지므로 대부분 추가 작업 없이 통과한다.
// 만약 release 빌드에서 크래시가 나면 apps/mobile/android/app/proguard-rules.pro
// 에 해당 라이브러리 keep 룰을 보강.

const { withGradleProperties } = require('@expo/config-plugins');

const PROPS = [
  { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
  { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
];

module.exports = function withAndroidMinify(config) {
  return withGradleProperties(config, (cfg) => {
    for (const desired of PROPS) {
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === desired.key,
      );
      if (existing) {
        existing.value = desired.value;
      } else {
        cfg.modResults.push(desired);
      }
    }
    return cfg;
  });
};

module.exports.PROPS = PROPS;
