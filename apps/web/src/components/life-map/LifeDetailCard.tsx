import { ArrowLeft, Crosshair, ExternalLink, Phone } from 'lucide-react';
import type { LifeMapItemType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_HOSPITAL_COLOR,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  formatDistanceM,
  formatLifeYm,
  lifeCctvPurposeGroup,
  summarizeLifeToiletFixtures,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { openLabel } from './lifeMapFormat';

// 선택 항목 상세 — 화장실(개방시간·변기수·편의·관리기관·주소)·CCTV(목적·대수·화소·방면·보관일수)·
// 병의원(종별·주소·연락처·홈페이지·개설일·의사수). 패널의 주변 목록 자리를 대신 차지하고
// '← 목록' 으로 돌아간다.

interface Props {
  item: LifeMapItemType;
  // 내 위치가 있으면 거리(m).
  distM: number | null;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

export const LifeDetailCard = ({ item, distM, onBack, onFlyTo }: Props) => {
  const hasCoords = item.lat !== null && item.lng !== null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="life-detail">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 px-2 text-xs">
          <ArrowLeft className="size-3.5" /> 목록
        </Button>
        {hasCoords && (
          <Button variant="ghost" size="sm" onClick={() => onFlyTo(item.lat!, item.lng!)} className="ml-auto h-7 gap-1 px-2 text-xs">
            <Crosshair className="size-3.5" /> 지도 중심으로
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {item.layer === 'toilet' ? (
          <ToiletDetail item={item} distM={distM} />
        ) : item.layer === 'hospital' ? (
          <HospitalDetail item={item} distM={distM} />
        ) : (
          <CctvDetail item={item} distM={distM} />
        )}
      </div>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 py-1.5 text-sm">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

const PhoneLink = ({ phone }: { phone: string }) => (
  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
    <Phone className="size-3" /> {phone}
  </a>
);

const ToiletDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'toilet' }>; distM: number | null }) => {
  const badges = LIFE_TOILET_FEATURES.filter((f) => item[f.key]);
  const fixtures = summarizeLifeToiletFixtures(item.fixtures);
  const special: string[] = [];
  if (item.fixtures.maleDisabledToilet + item.fixtures.maleDisabledUrinal + item.fixtures.femaleDisabledToilet > 0) {
    special.push(
      `장애인용 남 ${item.fixtures.maleDisabledToilet + item.fixtures.maleDisabledUrinal}·여 ${item.fixtures.femaleDisabledToilet}`,
    );
  }
  if (item.fixtures.maleKidsToilet + item.fixtures.maleKidsUrinal + item.fixtures.femaleKidsToilet > 0) {
    special.push(`어린이용 남 ${item.fixtures.maleKidsToilet + item.fixtures.maleKidsUrinal}·여 ${item.fixtures.femaleKidsToilet}`);
  }
  return (
    <>
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: LIFE_TOILET_COLOR }} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">{item.name}</h2>
          <p className="text-xs text-muted-foreground">
            {item.kind}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </p>
        </div>
      </div>
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b.key} className="rounded-full border px-2 py-0.5 text-[11px]">
              {b.label}
            </span>
          ))}
        </div>
      )}
      <dl className="mt-3 divide-y">
        <Row label="개방시간">{openLabel(item.openType, item.openDetail, item.open24)}</Row>
        <Row label="변기">
          {fixtures ?? '정보 없음'}
          {special.length > 0 && <span className="block text-xs text-muted-foreground">{special.join(' / ')}</span>}
        </Row>
        {item.bell && <Row label="비상벨">{item.bellPlace ?? '설치'}</Row>}
        {item.diaper && <Row label="기저귀교환대">{item.diaperPlace ?? '있음'}</Row>}
        <Row label="입구 CCTV">{item.entranceCctv ? '있음' : '없음'}</Row>
        <Row label="관리기관">
          {item.orgName}
          {item.phone && (
            <span className="block">
              <PhoneLink phone={item.phone} />
            </span>
          )}
        </Row>
        <Row label="주소">
          {item.roadAddr ?? item.lotAddr ?? '-'}
          {item.roadAddr && item.lotAddr && <span className="block text-xs text-muted-foreground">{item.lotAddr}</span>}
        </Row>
        <Row label="소유·처리">
          {item.ownerType}
          {item.disposal ? ` · ${item.disposal}` : ''}
        </Row>
        {(item.installedYm || item.remodeledYm) && (
          <Row label="설치·개보수">
            {formatLifeYm(item.installedYm) ?? '-'}
            {item.remodeledYm ? ` · 리모델링 ${formatLifeYm(item.remodeledYm)}` : ''}
          </Row>
        )}
        <Row label="기준일">{item.baseDate || '-'}</Row>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {item.geoSource
          ? `위치는 ${item.geoSource === 'road' ? '도로명' : '지번'} 주소를 VWorld 지오코더로 변환한 값이라 실제 입구와 수십 m 차이 날 수 있습니다.`
          : '주소를 좌표로 변환하지 못해 지도에는 표시되지 않습니다.'}
      </p>
    </>
  );
};

const HospitalDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'hospital' }>; distM: number | null }) => (
  <>
    <div className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: LIFE_HOSPITAL_COLOR }} />
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{item.name}</h2>
        <p className="text-xs text-muted-foreground">
          {item.kindName}
          {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
        </p>
      </div>
    </div>
    <dl className="mt-3 divide-y">
      <Row label="종별">{item.kindName}</Row>
      <Row label="주소">
        {item.addr ?? '-'}
        {item.postNo && <span className="block text-xs text-muted-foreground">우편번호 {item.postNo}</span>}
      </Row>
      {item.phone && (
        <Row label="전화">
          <PhoneLink phone={item.phone} />
        </Row>
      )}
      {item.url && (
        <Row label="홈페이지">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 underline-offset-2 hover:underline"
          >
            <span className="truncate">{item.url.replace(/^https?:\/\//, '')}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
        </Row>
      )}
      <Row label="개설일">{item.openedDate ?? '-'}</Row>
      <Row label="총의사수">{item.doctorCount !== null ? `${item.doctorCount}명` : '-'}</Row>
    </dl>
    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
      출처: 건강보험심사평가원 병원정보서비스(요양기관 신고 기준 — 실제 운영·진료시간과 다를 수 있습니다).
      {item.geoSource === 'road' || item.geoSource === 'parcel'
        ? ' 위치는 주소를 지오코더로 변환한 값이라 실제 입구와 차이 날 수 있습니다.'
        : item.geoSource === null
          ? ' 좌표가 없어 지도에는 표시되지 않습니다.'
          : ''}
    </p>
  </>
);

const CctvDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'cctv' }>; distM: number | null }) => (
  <>
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-1.5 size-3 shrink-0 rounded-full"
        style={{ backgroundColor: LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(item.purpose)] }}
      />
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{item.purpose} CCTV</h2>
        <p className="text-xs text-muted-foreground">
          {item.orgName}
          {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
        </p>
      </div>
    </div>
    <dl className="mt-3 divide-y">
      <Row label="카메라">
        {item.cameraCount !== null ? `${item.cameraCount}대` : '-'}
        {item.pixels !== null ? ` · ${item.pixels}만 화소` : ''}
      </Row>
      <Row label="촬영 방면">{item.direction ?? '-'}</Row>
      <Row label="보관일수">{item.keepDays !== null ? `${item.keepDays}일` : '-'}</Row>
      <Row label="설치연월">{formatLifeYm(item.installedYm) ?? '-'}</Row>
      <Row label="관리기관">
        {item.orgName}
        {item.phone && (
          <span className="block">
            <PhoneLink phone={item.phone} />
          </span>
        )}
      </Row>
      <Row label="주소">
        {item.roadAddr ?? item.lotAddr ?? '-'}
        {item.roadAddr && item.lotAddr && <span className="block text-xs text-muted-foreground">{item.lotAddr}</span>}
      </Row>
      <Row label="관리번호">
        <span className="font-mono text-xs">{item.id}</span>
      </Row>
      <Row label="기준일">{item.baseDate || '-'}</Row>
    </dl>
  </>
);
