import { SettlementWizard } from '../../src/components/settlement/SettlementWizard';

// 식당 없이 진입하는 정산 신규. 1차 식당은 Step2 에서 검색해 선택.
export default function SettlementNewScreen() {
  return <SettlementWizard />;
}
