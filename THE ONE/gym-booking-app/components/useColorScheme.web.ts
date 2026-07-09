import { useTheme } from '../context/ThemeContext';

export function useColorScheme(): 'light' | 'dark' {
  const { activeTheme } = useTheme();
  return activeTheme || 'dark'; // fallback just in case
}
