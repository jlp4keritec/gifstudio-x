import { createTheme, type ThemeOptions } from '@mui/material/styles';

export const lightThemeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#7C4DFF',
      light: '#B39DDB',
      dark: '#512DA8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#651FFF',
    },
    background: {
      default: '#FAFAFA',
      paper: '#FFFFFF',
    },
    divider: 'rgba(0, 0, 0, 0.08)',
    text: {
      primary: '#212121',
      secondary: '#616161',
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
          backgroundColor: '#FFFFFF',
          color: '#212121',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
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

export const lightTheme = createTheme(lightThemeOptions);
