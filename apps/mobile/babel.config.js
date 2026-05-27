// 모든 플랫폼에서 `import.meta` 를 안전한 객체 리터럴로 치환.
// 동기:
//  - Web 번들이 zustand 의 ESM build(`zustand/esm/middleware.mjs`)를 끌어오는데,
//    그 안의 `import.meta.env` 가 일반 `<script defer>` 컨텍스트에서
//    SyntaxError 를 낸다(`<script type="module">` 이 아님).
//  - Metro/babel-preset-expo 는 `import.meta` 를 변환하지 않는다.
// 플랫폼 게이트는 두지 않는다 — 우리 코드/의존성은 import.meta 를 의도해 쓰지
// 않고, 치환값이 zustand devtools 를 prod 경로로 평가시키는 부수효과는 native
// 에서도 무해(devtools 비활성)하다.
const replaceImportMeta = ({ types: t }) => ({
  name: 'replace-import-meta',
  visitor: {
    MetaProperty(path) {
      if (
        path.node.meta &&
        path.node.meta.name === 'import' &&
        path.node.property.name === 'meta'
      ) {
        // ({ env: { MODE: "production" } }) — zustand devtools 가
        // `import.meta.env?.MODE !== "production"` 으로 prod 체크하는데, prod
        // 으로 평가시켜 devtools 코드 경로를 비활성.
        path.replaceWith(
          t.objectExpression([
            t.objectProperty(
              t.identifier('env'),
              t.objectExpression([
                t.objectProperty(t.identifier('MODE'), t.stringLiteral('production')),
              ]),
            ),
          ]),
        );
      }
    },
  },
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [replaceImportMeta, 'react-native-reanimated/plugin'],
  };
};
