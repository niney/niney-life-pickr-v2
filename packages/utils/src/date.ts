export const toISOString = (date: Date = new Date()): string => date.toISOString();

export const fromISOString = (iso: string): Date => new Date(iso);

export const isValidDate = (date: unknown): date is Date =>
  date instanceof Date && !Number.isNaN(date.getTime());
