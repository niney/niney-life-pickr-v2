import { useLocalSearchParams } from 'expo-router';
import { SettlementWizard } from '../../../../../src/components/settlement/SettlementWizard';

// 저장된 정산을 수정. wizard 가 editingId 를 받으면 useSettlement 로 데이터를
// 가져와 draft store 로 hydrate 한 뒤 동일한 4-step 흐름을 보여준다.
export default function SettlementEditScreen() {
  const { placeId = '', id = '' } = useLocalSearchParams<{
    placeId: string;
    id: string;
  }>();
  return <SettlementWizard placeId={placeId} editingId={id} />;
}
