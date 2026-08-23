import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MealPhotoService } from './meal-photo.service.js';

const TOKEN = '11111111-2222-4333-8444-555555555555';

describe('MealPhotoService standalone delete 경계', () => {
  const make = (entryId: string | null) => {
    const findUnique = vi.fn(async () => ({
      token: TOKEN,
      userId: 'photo-delete-user',
      entryId,
      sortOrder: 0,
      width: 20,
      height: 20,
      byteSize: 100,
      createdAt: new Date(),
    }));
    const deletePhoto = vi.fn(async () => ({}));
    const prisma = {
      mealPhoto: { findUnique, delete: deletePhoto },
    } as unknown as PrismaClient;
    return { service: new MealPhotoService(prisma), deletePhoto };
  };

  it('기록에 붙은 사진은 attached 오류로 거절하고 DB·파일을 건드리지 않는다', async () => {
    const { service, deletePhoto } = make('meal-entry-id');
    await expect(service.remove('photo-delete-user', TOKEN)).rejects.toMatchObject({ code: 'attached' });
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it('연결되지 않은 업로드는 단독 DELETE로 취소할 수 있다', async () => {
    const { service, deletePhoto } = make(null);
    await expect(service.remove('photo-delete-user', TOKEN)).resolves.toBeUndefined();
    expect(deletePhoto).toHaveBeenCalledWith({ where: { token: TOKEN } });
  });
});
