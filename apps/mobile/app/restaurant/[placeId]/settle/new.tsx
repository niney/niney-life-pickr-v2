import { useLocalSearchParams } from 'expo-router';
import { SettlementWizard } from '../../../../src/components/settlement/SettlementWizard';

// 식당 상세에서 진입한 정산 신규. placeId 가 1차 식당으로 prefill 된다.
export default function SettlementNewScreen() {
  const { placeId = '' } = useLocalSearchParams<{ placeId: string }>();
  return <SettlementWizard placeId={placeId} />;
}
