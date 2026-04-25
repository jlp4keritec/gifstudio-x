export interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  ownerId: string;
  gifCount: number;
  createdAt: string;
}
