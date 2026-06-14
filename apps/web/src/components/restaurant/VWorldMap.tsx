import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import { useMapProviderSecret } from '@repo/shared';
import { MapCanvas, type MapMarker } from './MapCanvas';

interface Props {
  lat: number | null;
  lng: number | null;
  name: string;
  // 컨테이너 크기 오버라이드. 기본은 280px 고정 — 우측 사이드바에 들어갈
  // 사이즈. 풀 슬라이드오버에서는 'h-full w-full' 같은 값을 넘긴다.
  className?: string;
}

// 어드민 식당 상세에서 단일 마커 지도를 띄우는 박스. MapCanvas 의 thin wrapper
// 로, admin secret hook 을 통해 평문 키를 받아 전달한다. 좌표/키 미충족 상태는
// placeholder 로 분기.
export const VWorldMap = ({ lat, lng, name, className }: Props) => {
  const hasCoords = lat !== null && lng !== null;
  const secret = useMapProviderSecret('vworld', hasCoords);
  const apiKey = secret.data?.apiKey ?? null;
  const [tileError, setTileError] = useState<string | null>(null);

  const sizeClass = className ?? 'h-[280px] w-full';

  if (!hasCoords) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" /> 좌표 정보가 없습니다.
      </Placeholder>
    );
  }
  if (secret.isLoading) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <Loader2 className="size-4 animate-spin" /> 키 확인 중…
      </Placeholder>
    );
  }
  if (!apiKey) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" />
        <div>
          지도 키가 설정되지 않았습니다.{' '}
          <Link
            to="/admin/settings/map"
            className="text-primary underline underline-offset-2"
          >
            설정 &gt; 지도
          </Link>{' '}
          에서 등록하세요.
        </div>
      </Placeholder>
    );
  }

  const marker: MapMarker = { id: 'self', lat: lat!, lng: lng!, label: name };

  return (
    <div className={`relative ${sizeClass}`}>
      <MapCanvas
        apiKey={apiKey}
        markers={[marker]}
        initialCenter={{ lat: lat!, lng: lng!, zoom: 17 }}
        onTileError={(hasError) =>
          setTileError(
            hasError
              ? '지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.'
              : null,
          )
        }
        className="size-full overflow-hidden rounded-md border bg-muted"
      />
      {tileError && (
        <div className="absolute inset-x-2 top-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-center text-xs text-destructive">
          {tileError}
        </div>
      )}
    </div>
  );
};

const Placeholder = ({
  children,
  sizeClass,
}: {
  children: React.ReactNode;
  sizeClass: string;
}) => (
  <div
    className={`flex items-center justify-center gap-2 rounded-md border bg-muted/40 px-4 text-center text-xs text-muted-foreground ${sizeClass}`}
  >
    {children}
  </div>
);
