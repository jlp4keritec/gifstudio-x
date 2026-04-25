import type { Theme } from '@mui/material/styles';
import type { ThemeName } from '@gifstudio-x/shared';
import { darkTheme } from './dark';
import { mediumTheme } from './medium';
import { lightTheme } from './light';

export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  medium: mediumTheme,
  light: lightTheme,
};

export { darkTheme, mediumTheme, lightTheme };
