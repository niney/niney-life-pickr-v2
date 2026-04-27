import { useState } from 'react';
import { useRandomPick, usePicks } from '@repo/shared';

export const PicksPage = () => {
  const { data: picks, isLoading } = usePicks();
  const random = useRandomPick();
  const [result, setResult] = useState<string | null>(null);

  if (isLoading) return <p>Loading…</p>;

  return (
    <main className="container">
      <h1>내 Pick 목록</h1>
      {picks?.length === 0 && <p>아직 생성된 Pick이 없습니다.</p>}
      <ul className="stack">
        {picks?.map((pick) => (
          <li key={pick.id} className="card">
            <h3>{pick.title}</h3>
            <small>{pick.category}</small>
            <p>{pick.options.join(' / ')}</p>
            <button
              onClick={() =>
                random.mutate(pick.id, {
                  onSuccess: (r) => setResult(r.chosen),
                })
              }
            >
              랜덤 픽!
            </button>
          </li>
        ))}
      </ul>
      {result && (
        <div className="result">
          오늘의 선택: <strong>{result}</strong>
        </div>
      )}
    </main>
  );
};
