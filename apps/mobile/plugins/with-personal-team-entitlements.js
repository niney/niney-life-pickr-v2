// 무료(Personal) Apple 팀은 Push Notifications capability 를 지원하지 않는다.
// expo-notifications 플러그인은 iOS entitlements 에 `aps-environment` 를 항상 넣는데,
// 그 키가 있으면 개인 팀으로는 프로비저닝 프로파일 생성이 실패한다:
//   "Personal development teams ... do not support the Push Notifications capability."
//
// 앱은 로컬 알림(하차 알림)만 쓰고 원격 푸시를 받지 않으므로 로컬 빌드에선 이 키를 뺀다.
// EAS/유료 팀 빌드(EXPO_PUBLIC_ENABLE_APPLINKS=1 — associatedDomains 와 같은 스위치)에선
// 나중에 원격 푸시를 붙일 수 있게 그대로 둔다.

const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withPersonalTeamEntitlements(config) {
  if (process.env.EXPO_PUBLIC_ENABLE_APPLINKS === '1') return config;
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
