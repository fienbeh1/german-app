const API_URL = import.meta.env.VITE_API_URL || '';
const PG_API_URL = import.meta.env.VITE_PG_API_URL || '';
const USE_PG = import.meta.env.VITE_USE_PG === 'true';

function baseUrl(): string {
  return USE_PG ? PG_API_URL : API_URL;
}

export interface Book {
  id: string;
  name: string;
  path: string;
  pdfCount: number;
  annotationCount: number;
  aiCount: number;
  audioFileCount: number;
  videoFileCount: number;
  hasAnnotations: boolean;
  hasAI: boolean;
}

export interface PdfEntry {
  name: string;
  path: string;
  page: string;
}

export interface AnnotationEntry {
  file: string;
  page: string;
  struktur: { seite?: string; lektion?: string; abschnitt?: string };
  inhaltstyp: string[];
  thema: { de?: string; es?: string } | null;
  audioCount: number;
  vocabCount: number;
}

export interface Lesson {
  id: string;
  name: string;
  pdfs: PdfEntry[];
  annotations: AnnotationEntry[];
  aiFiles: { file: string; page: string }[];
  txtFiles: { file: string; page: string }[];
}

export interface Vocabulary {
  wort: string;
  artikel?: string;
  plural?: string;
  übersetzung_es: string;
  wortart: string;
  kontext?: string;
  source?: string;
  lektion?: string;
  seite?: string;
  english?: string;
  french?: string;
  audio_url?: string;
}

export interface Audio {
  anweisung: string;
  track: string;
  cd?: string;
  typ: string;
  beschreibung_es?: string;
  source?: string;
  lektion?: string;
  seite?: string;
}

export const api = {
  url(path: string): string {
    return `${baseUrl()}${path}`;
  },

  async fetch<T>(endpoint: string, opts?: RequestInit): Promise<T> {
    const url = `${baseUrl()}${endpoint}`;
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API ${endpoint}: ${res.status}`);
    return res.json();
  },

  async fetchWithFallback<T>(endpoint3001: string, endpoint3456?: string): Promise<T> {
    if (USE_PG && endpoint3456) {
      try {
        return await api.fetch<T>(endpoint3456);
      } catch {
        // fallback to 3001
      }
    }
    return api.fetch<T>(endpoint3001);
  },

  async getAiContent(bookId: string, page: string): Promise<{ file: string; content: string }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/ai/${encodeURIComponent(page)}`,
      `/books/${encodeURIComponent(bookId)}/ai/${encodeURIComponent(page)}`,
    );
  },

  async getAudioFiles(bookId: string): Promise<{ audioFiles: { name: string; path: string; lesson: string | null; size: number }[] }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/audio-files`,
      `/books/${encodeURIComponent(bookId)}/audio-files`,
    );
  },

  async getBooks(): Promise<Book[]> {
    return api.fetchWithFallback('/api/books', '/books');
  },

  async getLessons(bookId: string): Promise<Lesson> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/lessons`,
      `/books/${encodeURIComponent(bookId)}/lessons`,
    );
  },

  async getVocabulary(bookId: string): Promise<{ vocabulary: Vocabulary[] }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/vocabulary`,
      `/books/${encodeURIComponent(bookId)}/vocabulary`,
    );
  },

  async getAudio(bookId: string): Promise<{ audio: Audio[] }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/audio`,
      `/books/${encodeURIComponent(bookId)}/audio`,
    );
  },

  async getAnnotation(bookId: string, page: string): Promise<any> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/annotations/${page}`,
      `/books/${encodeURIComponent(bookId)}/annotations/${page}`,
    );
  },

  getPdfUrl(path: string): string {
    return `${baseUrl()}${path}`;
  },

  async getVideoFiles(bookId: string): Promise<{ videoFiles: { name: string; path: string; size: number }[] }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/video-files`,
      `/books/${encodeURIComponent(bookId)}/video-files`,
    );
  },

  async getTextContent(bookId: string, page: string): Promise<{ file: string; content: string }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/text/${encodeURIComponent(page)}`,
      `/books/${encodeURIComponent(bookId)}/text/${encodeURIComponent(page)}`,
    );
  },

  async getExercises(bookId: string): Promise<{ exercises: any[] }> {
    return api.fetchWithFallback(
      `/api/books/${encodeURIComponent(bookId)}/exercises`,
      `/books/${encodeURIComponent(bookId)}/exercises`,
    );
  },

  async getTranskriptionen(bookId: string, params?: { lektion?: string; ziel?: string }): Promise<any[]> {
    const q = new URLSearchParams()
    if (params?.lektion) q.set('lektion', params.lektion)
    if (params?.ziel) q.set('ziel', params.ziel)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return api.fetch(`/books/${encodeURIComponent(bookId)}/transkriptionen${qs}`)
  },

  async getLoesungen(bookId: string, params?: { lektion?: string; ziel?: string }): Promise<any[]> {
    const q = new URLSearchParams()
    if (params?.lektion) q.set('lektion', params.lektion)
    if (params?.ziel) q.set('ziel', params.ziel)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return api.fetch(`/books/${encodeURIComponent(bookId)}/loesungen${qs}`)
  },

  async getLektionen(bookId: string): Promise<{ lektion: string; page_min: number; page_max: number }[]> {
    return api.fetch(`/books/${encodeURIComponent(bookId)}/lektionen`)
  },

  async getFilteredVocabulary(bookId: string, opts?: { lektion?: string; page?: string; nivel?: string; search?: string }): Promise<{ vocabulary: Vocabulary[]; total: number }> {
    const q = new URLSearchParams()
    if (opts?.lektion) q.set('lektion', opts.lektion)
    if (opts?.page) q.set('page', opts.page)
    if (opts?.nivel) q.set('nivel', opts.nivel)
    if (opts?.search) q.set('search', opts.search)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return api.fetch(`/books/${encodeURIComponent(bookId)}/vocabulary/filter${qs}`)
  },

  async getPageAudio(bookId: string): Promise<{ pageAudio: any[] }> {
    return api.fetch(`/books/${encodeURIComponent(bookId)}/page-audio`)
  },

  async getLessonStats(bookId: string): Promise<{ lessons: { lektion: string; vocab_count: number; vocab_entries: number }[] }> {
    return api.fetch(`/books/${encodeURIComponent(bookId)}/lesson-stats`)
  },

  async getVerbs(opts?: { page?: number; limit?: number; level?: string }): Promise<{ verbs: any[]; total: number; page: number; limit: number }> {
    const q = new URLSearchParams()
    if (opts?.page !== undefined) q.set('page', String(opts.page))
    if (opts?.limit) q.set('limit', String(opts.limit))
    if (opts?.level) q.set('level', opts.level)
    const qs = q.toString() ? `?${q.toString()}` : ''
    return api.fetch(`/api/verbs${qs}`)
  },

  async searchSegments(query: string, book?: string): Promise<any[]> {
    const q = new URLSearchParams({ q: query })
    if (book) q.set('book', book)
    return api.fetch(`/segments/search?${q.toString()}`)
  }
};
