import path from 'node:path';
import { Config } from '@remotion/cli/config';

// 장면 코드는 웹 폴더(apps/web/src/routes/meal-story/motion)에 있다 — 그 파일들이 부르는 react·remotion 도 이 폴더의
// node_modules 것을 먼저 찾게 해 한 벌만 싣는다(웹 쪽 사본과 섞이면 Remotion 이 '두 벌' 오류를 낸다).
const modules = path.join(process.cwd(), 'node_modules');

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: { ...config.resolve, modules: [modules, 'node_modules'] },
}));
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
