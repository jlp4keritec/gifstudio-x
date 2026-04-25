import { createTheme, type ThemeOptions } from '@mui/material/styles';

export const darkThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196F3',
      light: '#64B5F6',
      dark: '#1976D2',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#90CAF9',
    },
    background: {
      default: '#1E1E1E',
      paper: '#2D2D2D',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
    text: {
      primary: '#E0E0E0',
      secondary: '#9E9E9E',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 13,
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#252525',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
};

export const darkTheme = createTheme(darkThemeOptions);
