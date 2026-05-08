import { Moon, Sun } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useThemeStore } from '~/stores/theme';

export const ThemeToggle = () => {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = mode === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로' : '다크 모드로'}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
};
