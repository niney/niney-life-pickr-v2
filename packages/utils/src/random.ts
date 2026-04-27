export const pickRandom = <T>(items: readonly T[]): T => {
  if (items.length === 0) throw new Error('Cannot pick from empty array');
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] as T;
};

export const shuffle = <T>(items: readonly T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
};
