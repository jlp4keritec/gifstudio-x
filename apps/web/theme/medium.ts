import { createTheme, type ThemeOptions } from '@mui/material/styles';

export const mediumThemeOptions: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#FF9800',
      light: '#FFB74D',
      dark: '#F57C00',
      contrastText: '#000000',
    },
    secondary: {
      main: '#FFC107',
    },
    background: {
      default: '#3A3A3A',
      paper: '#4A4A4A',
    },
    divider: 'rgba(255, 255, 255, 0.1)',
    text: {
      primary: '#F5F5F5',
      secondary: '#BDBDBD',
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
          backgroundColor: '#2F2F2F',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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

export const mediumTheme = createTheme(mediumThemeOptions);
