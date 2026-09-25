import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Routes, type TarotShareResultType } from '@repo/api-contract';
import { useCreateTarotShare, type TarotShareBase } from '@repo/shared';
import { webUrl } from '~/lib/api-setup';
import { CheckRow, ErrorText, Icon, Muted, OutlineButton, PrimaryButton } from './tarotUi';
import { TR, gold, ink, white } from './tarotTokens';

// 리딩 공유 — 사주 공유와 같은 방식. 링크는 "웹" 주소로 나간다(받는 사람 대부분은 앱이 없고, 웹 공유 페이지가 OG 미리보기·
// 로그인 없는 보기를 이미 한다). 앱은 토큰을 발급해 웹 URL 을 OS 공유 시트에 넘길 뿐 앱 안 공유 페이지는 두지 않는다.
// 회원은 readingId, 게스트는 리딩 입력을 보낸다(서버가 본문을 다시 확보 — 클라이언트 문장을 게시하지 않는다).
// 질문은 사적일 수 있어 기본 숨김. 세로 이미지(스토리)는 서버 PNG 를 캐시에 받아 파일로 공유한다.

const origin = webUrl.replace(/\/$/, '');

export const TarotShareSheet = ({ open, onClose, base, hasQuestion }: { open: boolean; onClose: () => void; base: TarotShareBase; hasQuestion: boolean }) => {
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [share, setShare] = useState<TarotShareResultType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const mutation = useCreateTarotShare();

  const url = share ? `${origin}${share.path}` : null;
  const stale = share !== null && share.includeQuestion !== includeQuestion;
  const imageUrl = (format: 'og' | 'story') => (share ? `${origin}${Routes.Tarot.shareImage(share.token, format)}` : '');

  const create = () => {
    setError(null);
    mutation.mutate(
      { ...base, includeQuestion },
      {
        onSuccess: (res) => setShare(res),
        onError: () => setError('공유 링크를 만들지 못했어요'),
      },
    );
  };
  const osShare = async () => {
    if (!url) return;
    try {
      await Share.share(Platform.OS === 'ios' ? { url, message: '타로 리딩' } : { message: url, title: '타로 리딩' });
    } catch {
      // 사용자가 시트를 닫은 경우 — 조용히.
    }
  };
  const shareStory = async () => {
    if (!share || imageBusy) return;
    setImageBusy(true);
    setError(null);
    try {
      const dest = `${FileSystem.cacheDirectory}tarot-${share.token}-story.png`;
      const { uri, status } = await FileSystem.downloadAsync(imageUrl('story'), dest);
      if (status !== 200) throw new Error(`download ${status}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '타로 리딩 이미지 공유' });
      } else {
        await Share.share({ url: uri });
      }
    } catch {
      setError('이미지를 공유하지 못했어요 — 잠시 후 다시 시도해 주세요.');
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <Modal visible={open} onRequestClose={onClose} animationType="slide" presentationStyle="formSheet">
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.header}>
          <Icon name="share-variant" size={16} />
          <Text style={styles.title}>리딩 공유</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8} style={styles.close}>
            <Icon name="close" size={18} color={ink(0.7)} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Muted size={12} dim={0.6}>
            링크를 받은 사람은 앱이 없어도 웹에서 로그인 없이 카드와 해석을 볼 수 있어요. 링크는 만료되지 않아요.
          </Muted>
          {hasQuestion ? <CheckRow label="질문도 함께 보여주기" checked={includeQuestion} onChange={setIncludeQuestion} /> : null}
          {!share || stale ? (
            <PrimaryButton label={stale ? '설정대로 링크 다시 만들기' : '공유 링크 만들기'} icon="link-variant" busy={mutation.isPending} onPress={create} />
          ) : (
            <View style={{ gap: 10 }}>
              <Text selectable style={styles.url} numberOfLines={2} testID="tarot-share-url">
                {url}
              </Text>
              <View style={styles.row}>
                <OutlineButton label="공유하기" icon="export-variant" onPress={() => void osShare()} style={{ flex: 1 }} />
                <OutlineButton label="세로 이미지" icon="image-outline" busy={imageBusy} onPress={() => void shareStory()} style={{ flex: 1 }} />
              </View>
              <Image source={{ uri: imageUrl('og') }} style={styles.preview} contentFit="contain" accessibilityLabel="공유 미리보기" transition={200} />
            </View>
          )}
          {error ? <ErrorText>{error}</ErrorText> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TR.panel },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TR.cream },
  close: { padding: 4 },
  body: { paddingHorizontal: 18, paddingBottom: 24, gap: 14 },
  row: { flexDirection: 'row', gap: 8 },
  url: { borderWidth: 1, borderColor: white(0.12), backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: ink(0.8) },
  preview: { width: '100%', aspectRatio: 1200 / 630, borderRadius: 10, borderWidth: 1, borderColor: gold(0.15), backgroundColor: TR.bg },
});
