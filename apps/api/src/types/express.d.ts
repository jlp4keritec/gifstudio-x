// Augmentation du type Express.Request pour inclure le user authentifie
// Ce fichier doit etre inclus dans le build TypeScript
// Note: pas de "import" en haut → fichier ambient global

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: 'admin' | 'moderator' | 'user';
      };
    }
  }
}

// Ce export vide rend le fichier "module" pour que TypeScript respecte le declare global
export {};
