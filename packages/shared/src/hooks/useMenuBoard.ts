import { useMutation, useQuery } from '@tanstack/react-query';
import { menuBoardApi } from '../api/menu-board.api.js';

// 메뉴판 읽기(어드민 테스트) 훅.
export const useMenuBoardSamples = () =>
  useQuery({
    queryKey: ['admin', 'menu-board', 'samples'],
    queryFn: menuBoardApi.samples,
    staleTime: 5 * 60_000,
  });

export const useMenuBoardEvalReport = () =>
  useQuery({
    queryKey: ['admin', 'menu-board', 'eval'],
    queryFn: menuBoardApi.evalReport,
  });

// 사진 한 장 읽기 — 비전 LLM 1콜(kimi-k3 장당 약 7초).
export const useReadMenuBoard = () =>
  useMutation({
    mutationFn: ({ file, filename }: { file: Blob; filename?: string }) => menuBoardApi.read(file, filename),
  });

// 샘플 사진 원본(Blob) — 화면에 띄우고 같은 Blob 을 읽기에 올린다.
export const useMenuBoardSampleImage = () =>
  useMutation({
    mutationFn: (key: string) => menuBoardApi.sampleImage(key),
  });
