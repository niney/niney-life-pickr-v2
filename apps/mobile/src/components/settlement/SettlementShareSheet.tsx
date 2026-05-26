import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  getApiConfig,
  useCreateSettlementShare,
  useRevokeSettlementShare,
  useTheme,
  type Theme,
} from '@repo/shared';

interface Props {
  open: boolean;
  sessionId: string;
  onClose: () => void;
}

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setShareUrl(null);
    create
      .mutateAsync(sessionId)
      .then((res) => {
        if (cancelled) return;
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '공유 링크 생성 실패');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
    } catch {
      // 사용자 취소 등은 무시.
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

        <View style={styles.body}>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            링크 받은 사람은 로그인 없이 결과를 볼 수 있습니다. 영수증 사진은
            공유되지 않으며, 해제하면 이전 링크는 영구히 동작하지 않습니다.
          </Text>

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
                길게 눌러 복사하거나 아래 "공유…" 로 시스템 시트를 여세요.
              </Text>

              <View style={styles.actionsRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleShare}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: pressed
                        ? theme.colors.primaryHover
                        : theme.colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: theme.colors.primaryText },
                    ]}
                  >
                    공유…
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
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const absoluteUrl = (path: string): string => {
  if (/^https?:/i.test(path)) return path;
  const explicit = (process.env.EXPO_PUBLIC_WEB_URL || '').trim();
  const token = path.split('/').pop() ?? '';
  if (explicit) {
    return `${explicit.replace(/\/$/, '')}/share/settlements/${token}`;
  }
  // fallback — API base 의 호스트만 떼어 share 경로 붙임. 대부분 api/web 동일 도메인.
  try {
    const apiBase = getApiConfig().baseUrl;
    const match = apiBase.match(/^(https?:\/\/[^/]+)/);
    if (match) return `${match[1]}/share/settlements/${token}`;
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
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    primaryBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryBtnText: { fontSize: 14, fontWeight: '600' },
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
