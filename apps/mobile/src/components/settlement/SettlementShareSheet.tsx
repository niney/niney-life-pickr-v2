import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ApiError,
  getApiConfig,
  useCreateSettlementShare,
  useRevokeSettlementShare,
  useTheme,
  type Theme,
} from '@repo/shared';
import { Routes, type ShareOgImageType, type ShareTtlType } from '@repo/api-contract';

interface Props {
  open: boolean;
  sessionId: string;
  onClose: () => void;
}

// 유효 기간 프리셋. 무제한 없음 — 모든 링크가 최대 30일 내 만료된다.
const TTL_OPTIONS: { value: ShareTtlType; label: string }[] = [
  { value: '1d', label: '1일' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
];

// 링크 미리보기(OG) 이미지 — 기본 식당 사진(랜덤), 없으면 정산표로 폴백.
const OGIMAGE_OPTIONS: { value: ShareOgImageType; label: string }[] = [
  { value: 'restaurant', label: '식당 사진' },
  { value: 'table', label: '정산표' },
];

// 만료 ISO → "YYYY.MM.DD HH:mm". owner 안내용.
const formatExpiry = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 공유 시트 — open 시 자동으로 토큰 발급 (서버 멱등). 토큰을 절대 URL 로
// 변환해 RN Share.share() 로 시스템 공유 시트 호출 + 클립보드 복사 버튼 +
// 공유 해제.
//
// shareUrl 절대 변환: 서버는 /api/v1/share/settlements/<token> 같은 상대 경로를
// 돌려준다. 웹은 window.location.origin 을 쓰지만 RN 에는 없다. 대신 환경변수
// EXPO_PUBLIC_WEB_URL 우선, 없으면 API baseUrl 의 호스트만 떼어 share 경로를
// 붙인다 — 대부분의 배포에서 api 와 web 이 같은 도메인이라 안전한 fallback.
export const SettlementShareSheet = ({ open, sessionId, onClose }: Props) => {
  const theme = useTheme();
  const styles = useStyles(theme);
  const create = useCreateSettlementShare();
  const revoke = useRevokeSettlementShare();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [ttl, setTtl] = useState<ShareTtlType>('7d');
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  // 링크 미리보기(OG) 이미지 선택 — 서버가 저장한 값으로 동기화.
  const [ogImage, setOgImage] = useState<ShareOgImageType>('restaurant');
  // 갤러리에서 고른 식당 사진 원본 URL(null=랜덤) + 고를 수 있는 후보 목록.
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [ogCandidates, setOgCandidates] = useState<string[]>([]);

  // open 또는 기간 변경 시 토큰 생성/갱신. 토큰은 멱등이라 URL 은 그대로 두고
  // 만료만 갱신 — 기간 바꿔도 깜빡임 없이 expiresAt 만 바뀐다. ogImage 는 보내지
  // 않는다 — 서버가 기존 선택을 유지하고 그 값을 돌려준다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    create
      .mutateAsync({ id: sessionId, ttl })
      .then((res) => {
        if (cancelled) return;
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
        setExpiresAt(res.expiresAt);
        setOgImage(res.ogImage);
        setOgImageUrl(res.ogImageUrl);
        setOgCandidates(res.ogImageCandidates);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '공유 링크 생성 실패');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, ttl]);

  // 미리보기 이미지 선택 — 모드 토글(식당 사진/정산표) 과 갤러리에서 특정 사진
  // 고정을 한 함수로 처리. url: undefined=유지 / null=랜덤으로 해제 / URL=고정.
  const handleSelectOgImage = (mode: ShareOgImageType, url?: string | null) => {
    if (create.isPending) return;
    if (mode === ogImage && (url === undefined || url === ogImageUrl)) return;
    setOgImage(mode); // 낙관적
    if (url !== undefined) setOgImageUrl(url);
    create
      .mutateAsync({ id: sessionId, ttl, ogImage: mode, ogImageUrl: url })
      .then((res) => {
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
        setExpiresAt(res.expiresAt);
        setOgImage(res.ogImage);
        setOgImageUrl(res.ogImageUrl);
        setOgCandidates(res.ogImageCandidates);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : '미리보기 이미지 변경 실패');
      });
  };

  // 후보 식당 사진을 thumbnail 프록시로 감싼 절대 URL. RN <Image> 는 상대경로를
  // 못 쓰므로 API base(origin)에 프록시 경로를 붙인다.
  const thumbSrc = (url: string, w: number): string => {
    let base = '';
    try {
      base = getApiConfig().baseUrl.replace(/\/$/, '');
    } catch {
      base = '';
    }
    return `${base}${Routes.Media.thumbnail}?url=${encodeURIComponent(url)}&w=${w}&q=70`;
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
    } catch {
      // 사용자 취소 등은 무시.
    }
  };

  // 정산표를 '이미지'로 공유 — 서버가 만든 정산 요약 카드 PNG 를 캐시에 내려받아
  // 시스템 공유 시트(카카오톡 등)에 파일로 첨부한다. 링크와 달리 받는 사람이
  // 클릭/로그인 없이 바로 본다. (서버 라우트: /s/<token>/image.png)
  const handleShareImage = async () => {
    if (!shareUrl || imageBusy) return;
    setImageBusy(true);
    setError(null);
    try {
      const imageUrl = `${shareUrl}/image.png`;
      const dest = `${FileSystem.cacheDirectory}settlement-${sessionId}.png`;
      const { uri, status } = await FileSystem.downloadAsync(imageUrl, dest);
      if (status !== 200) throw new Error(`download ${status}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: '정산표 이미지 공유',
        });
      } else {
        // 공유 모듈을 못 쓰는 환경 — 파일 URL 로 폴백.
        await Share.share({ url: uri });
      }
    } catch {
      setError('이미지 공유 실패 — 잠시 후 다시 시도하세요.');
    } finally {
      setImageBusy(false);
    }
  };

  const handleRevoke = () => {
    Alert.alert(
      '공유 해제',
      '공유 링크를 해제할까요? 이전 링크는 더 이상 동작하지 않습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          style: 'destructive',
          onPress: async () => {
            try {
              await revoke.mutateAsync(sessionId);
              setShareUrl(null);
              onClose();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : '공유 해제 실패');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <Modal
      visible={open}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="formSheet"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            🔗 공유 링크
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            링크 받은 사람은 로그인 없이 결과를 볼 수 있습니다. 영수증 사진은
            공유되지 않으며, 설정한 기간이 지나거나 해제하면 링크는 더 이상
            동작하지 않습니다.
          </Text>

          {/* 유효 기간 선택 — 바꾸면 같은 링크의 만료만 갱신된다. */}
          <View style={styles.ttlGroup}>
            <Text style={[styles.ttlLabel, { color: theme.colors.textMuted }]}>
              유효 기간
            </Text>
            <View style={styles.ttlRow}>
              {TTL_OPTIONS.map((opt) => {
                const active = ttl === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={create.isPending}
                    onPress={() => setTtl(opt.value)}
                    style={[
                      styles.ttlBtn,
                      {
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primary : 'transparent',
                        opacity: create.isPending ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ttlBtnText,
                        { color: active ? theme.colors.primaryText : theme.colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 링크 미리보기 이미지 — 카톡 등에 링크 붙였을 때 뜨는 그림. 기본 식당
              사진(랜덤), 식당 사진이 없으면 자동으로 정산표가 뜬다. */}
          <View style={styles.ttlGroup}>
            <Text style={[styles.ttlLabel, { color: theme.colors.textMuted }]}>
              링크 미리보기 이미지
            </Text>
            <View style={styles.ttlRow}>
              {OGIMAGE_OPTIONS.map((opt) => {
                const active = ogImage === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={create.isPending}
                    onPress={() => handleSelectOgImage(opt.value)}
                    style={[
                      styles.ttlBtn,
                      {
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primary : 'transparent',
                        opacity: create.isPending ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.ttlBtnText,
                        { color: active ? theme.colors.primaryText : theme.colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 식당 사진 모드일 때 후보 갤러리 — 탭한 사진으로 미리보기 고정.
                '랜덤' 칸은 선택을 해제(토큰 시드로 자동 한 장). 사진이 없으면 숨김. */}
            {ogImage === 'restaurant' && ogCandidates.length > 0 && (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryRow}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: ogImageUrl === null }}
                    disabled={create.isPending}
                    onPress={() => handleSelectOgImage('restaurant', null)}
                    style={[
                      styles.galleryTile,
                      styles.galleryRandom,
                      {
                        borderColor:
                          ogImageUrl === null ? theme.colors.primary : theme.colors.border,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color:
                          ogImageUrl === null ? theme.colors.primary : theme.colors.textMuted,
                      }}
                    >
                      랜덤
                    </Text>
                  </Pressable>
                  {ogCandidates.map((url) => {
                    const selected = ogImageUrl === url;
                    return (
                      <Pressable
                        key={url}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={create.isPending}
                        onPress={() => handleSelectOgImage('restaurant', url)}
                        style={[
                          styles.galleryTile,
                          {
                            borderColor: selected
                              ? theme.colors.primary
                              : theme.colors.border,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: thumbSrc(url, 160) }}
                          style={styles.galleryImage}
                          resizeMode="cover"
                        />
                        {selected && (
                          <View
                            style={[
                              styles.galleryCheck,
                              { backgroundColor: theme.colors.primary },
                            ]}
                          >
                            <Text style={{ color: theme.colors.primaryText, fontSize: 11 }}>
                              ✓
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.urlNote, { color: theme.colors.textMuted }]}>
                  사진을 골라 미리보기를 고정하세요. ‘랜덤’은 자동으로 한 장을 고릅니다.
                </Text>
              </>
            )}
          </View>

          {error && (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {error}
            </Text>
          )}

          {!shareUrl && !error && (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.text} />
            </View>
          )}

          {shareUrl && (
            <>
              <TextInput
                value={shareUrl}
                editable={false}
                selectTextOnFocus
                style={[
                  styles.urlInput,
                  {
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              />

              <Text
                style={[styles.urlNote, { color: theme.colors.textMuted }]}
              >
                정산표를 이미지로 보내거나, 길게 눌러 링크를 복사하세요.
              </Text>

              {expiresAt && (
                <Text style={[styles.urlNote, { color: theme.colors.textMuted }]}>
                  {formatExpiry(expiresAt)}까지 유효
                </Text>
              )}

              {/* 1순위: 정산표 이미지 공유 — 카카오톡 등에 바로 첨부. */}
              <Pressable
                accessibilityRole="button"
                disabled={imageBusy}
                onPress={handleShareImage}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: pressed
                      ? theme.colors.primaryHover
                      : theme.colors.primary,
                    opacity: imageBusy ? 0.7 : 1,
                  },
                ]}
              >
                {imageBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryText} />
                ) : (
                  <Text
                    style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}
                  >
                    🧾 정산표 이미지로 공유
                  </Text>
                )}
              </Pressable>

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleShare}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.secondaryBtnText, { color: theme.colors.text }]}>
                    🔗 링크 공유…
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={revoke.isPending}
                  onPress={handleRevoke}
                  style={({ pressed }) => [
                    styles.dangerBtn,
                    {
                      borderColor: theme.colors.danger,
                      backgroundColor: pressed
                        ? theme.colors.dangerBg
                        : 'transparent',
                      opacity: revoke.isPending ? 0.5 : 1,
                    },
                  ]}
                >
                  {revoke.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.danger} />
                  ) : (
                    <Text style={[styles.dangerBtnText, { color: theme.colors.danger }]}>
                      공유 해제
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const absoluteUrl = (path: string): string => {
  if (/^https?:/i.test(path)) return path;
  const explicit = (process.env.EXPO_PUBLIC_WEB_URL || '').trim();
  const token = path.split('/').pop() ?? '';
  if (explicit) {
    return `${explicit.replace(/\/$/, '')}/s/${token}`;
  }
  // fallback — API base 의 호스트만 떼어 share 경로 붙임. 대부분 api/web 동일 도메인.
  try {
    const apiBase = getApiConfig().baseUrl;
    const match = apiBase.match(/^(https?:\/\/[^/]+)/);
    if (match) return `${match[1]}/s/${token}`;
  } catch {
    // ignore
  }
  return path;
};

const useStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 15, fontWeight: '600' },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    bodyScroll: { flex: 1 },
    body: { padding: 16, gap: 12 },
    hint: { fontSize: 12, lineHeight: 18 },
    errorText: { fontSize: 13 },
    loading: { padding: 24, alignItems: 'center' },
    urlInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 12,
    },
    urlNote: { fontSize: 11 },
    ttlGroup: { gap: 6 },
    ttlLabel: { fontSize: 12, fontWeight: '500' },
    ttlRow: { flexDirection: 'row', gap: 8 },
    ttlBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ttlBtnText: { fontSize: 13, fontWeight: '600' },
    galleryRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    galleryTile: {
      width: 64,
      height: 64,
      borderRadius: 8,
      borderWidth: 2,
      overflow: 'hidden',
    },
    galleryRandom: { alignItems: 'center', justifyContent: 'center' },
    galleryImage: { width: '100%', height: '100%' },
    galleryCheck: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    primaryBtn: {
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryBtnText: { fontSize: 14, fontWeight: '600' },
    secondaryBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '600' },
    dangerBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerBtnText: { fontSize: 14, fontWeight: '600' },
  });
};
