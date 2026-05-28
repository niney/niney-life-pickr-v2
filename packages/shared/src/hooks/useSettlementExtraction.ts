import { useMutation } from '@tanstack/react-query';
import type { ExtractReceiptInputType } from '@repo/api-contract';
import {
  settlementExtractionApi,
  type ReceiptUploadFile,
} from '../api/settlement-extraction.api.js';

// 정산하기 영수증 업로드 훅 — 웹 Blob/File 또는 RN { uri, name, type } 한 장.
// 성공 시 imageToken, previewUrl, byteSize 를 그대로 돌려준다.
export const useUploadReceipt = () =>
  useMutation({
    mutationFn: (file: ReceiptUploadFile) => settlementExtractionApi.upload(file),
  });

// 업로드된 이미지를 vision LLM 으로 추출. 응답에 warning 이 채워져 있으면
// UI 가 경고 배너를 띄운다.
export const useExtractReceipt = () =>
  useMutation({
    mutationFn: (input: ExtractReceiptInputType) =>
      settlementExtractionApi.extract(input),
  });
