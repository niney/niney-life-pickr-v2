import type { AirUserLocation, PrismaClient } from '@prisma/client';
import type {
  AirLocationItemType,
  AirLocationResultType,
  AirLocationUpsertBodyType,
} from '@repo/api-contract';

// 내 대기 위치(저장 지점) — 사용자당 1행. 모든 메서드가 userId 를 받아 본인 행만 다루며
// (소유자 스코프), 변경 계열은 변경 후 상태를 그대로 돌려줘 클라이언트가 캐시를 통째로
// 교체한다(버스 즐겨찾기 서비스와 같은 규율). DELETE 는 멱등(deleteMany).

const toItem = (row: AirUserLocation): AirLocationItemType => ({
  lat: row.lat,
  lng: row.lng,
  label: row.label,
  // DB 는 문자열 — 계약 어휘로 접는다(미지 값은 manual 로).
  source: row.source === 'geolocation' ? 'geolocation' : 'manual',
  updatedAt: row.updatedAt.toISOString(),
});

export class AirLocationService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<AirLocationResultType> {
    const row = await this.prisma.airUserLocation.findUnique({ where: { userId } });
    return { location: row ? toItem(row) : null };
  }

  // 덮어쓰기 저장 — 있으면 좌표·라벨·출처 갱신(updatedAt 자동), 없으면 생성.
  async upsert(userId: string, body: AirLocationUpsertBodyType): Promise<AirLocationResultType> {
    const data = { lat: body.lat, lng: body.lng, label: body.label, source: body.source };
    const row = await this.prisma.airUserLocation.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return { location: toItem(row) };
  }

  async remove(userId: string): Promise<AirLocationResultType> {
    await this.prisma.airUserLocation.deleteMany({ where: { userId } });
    return { location: null };
  }
}
