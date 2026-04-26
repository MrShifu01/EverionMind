export interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  query: Record<string, string | string[]>;
  socket?: { remoteAddress?: string };
  user?: string; // added by withAuth middleware
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
  redirect: (code: number, url: string) => void;
}
