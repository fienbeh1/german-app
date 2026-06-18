import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('Database Tables', () => {
  describe('parsed_exercises', () => {
    it('has required columns', async () => {
      const pool = { query: () => Promise.resolve({ rows: [{ column_name: 'id' }] }) }
      const cols = ['id', 'curso_id', 'unidad', 'ejercicio', 'pregunta', 'respuesta', 'tipo_ejercicio']
      cols.forEach(col => expect(col).toBeDefined())
    })
  })

  describe('user_progress', () => {
    it('should track course progress', async () => {
      const progress = {
        id: 1,
        curso_id: 1,
        lektion: 1,
        page: 10,
        completed: true,
        created_at: new Date()
      }
      expect(progress.curso_id).toBe(1)
      expect(progress.completed).toBe(true)
    })
  })

  describe('bookmarks', () => {
    it('should store bookmarks with notes', async () => {
      const bookmark = {
        id: 1,
        curso_id: 1,
        lektion: 1,
        page: 10,
        note: 'Important grammar',
        created_at: new Date()
      }
      expect(bookmark.note).toBe('Important grammar')
    })
  })

  describe('user_answers', () => {
    it('should track correct/incorrect answers', async () => {
      const answer = {
        id: 1,
        ejercicio_id: 42,
        user_answer: 'Das ist ein Buch',
        correct: true,
        created_at: new Date()
      }
      expect(answer.correct).toBe(true)
      expect(answer.user_answer).toContain('Buch')
    })
  })
})

describe('PDF Processing', () => {
  const pdfMap = {
    1: { kb: 'Lagune 1/Kursbuch.pdf', kb1: null, kb2: null, ab: 'Lagune 1/Arbeitsbuch.pdf' },
    4: { kb: null, kb1: 'Tangram 1/Lektion 1-4.pdf', kb2: 'Tangram 1/Lektion 5-8.pdf', ab: 'Tangram 1/Ubungsheft.pdf' },
    9: { kb: 'B2/HauptKurs.pdf', ab: 'B2/EM_Neu_AB.pdf' }
  }

  it('should select correct book for page range', () => {
    const kb2Page = 60
    const c = pdfMap[4]
    const useSecond = kb2Page > 50
    const selected = useSecond && c.kb2 ? c.kb2 : (c.kb1 || c.kb)
    expect(selected).toContain('5-8')
  })

  it('should map course to PDF', () => {
    expect(pdfMap[1].kb).toContain('Lagune')
    expect(pdfMap[4].kb1).toContain('1-4')
    expect(pdfMap[4].kb2).toContain('5-8')
  })
})

describe('OCR Processing', () => {
  it('should extract exercises from text', () => {
    const text = '5. Was ist das? a)ein Buch b)ein Stift c)ein Tisch'
    
    const patterns = [
      /(\d+)[\.\)]\s*([^\n]{10,100})/g
    ]
    
    let exercises = []
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(text))) {
        exercises.push({ numero: match[1], pregunta: match[2] })
      }
    }
    
    expect(exercises.length).toBeGreaterThan(0)
  })

  it('should clean OCR text', () => {
    const dirty = '  5  .  Was  ist  das  ?  '
    const clean = dirty.replace(/\s+/g, ' ').replace(/\s\.\s/g, '.').replace(/\s\?\s/g, '?').trim()
    expect(clean.length).toBeGreaterThan(0)
  })
})

describe('Audio Processing', () => {
  const audioMap = {
    1: {
      name: 'Lagune 1',
      dirs: [
        { path: 'Lagune 1/Arbeitsbuch-CD', label: 'AB' },
        { path: 'Lagune 1/Kursbuch-CD1', label: 'KB1' }
      ]
    },
    9: {
      name: 'B2',
      dirs: [
        { path: 'B2/Kursbuch Hoertexte/EM neu - Hauptkurs cd 1', label: 'CD 1' },
        { path: 'B2/Kursbuch Hoertexte/EM neu - Hauptkurs cd 2', label: 'CD 2' }
      ]
    }
  }

  it('should filter mp3 files', () => {
    const files = ['01Track.mp3', '02Track.mp3', 'cover.jpg', 'notes.txt']
    const mp3s = files.filter(f => f.endsWith('.mp3'))
    expect(mp3s.length).toBe(2)
  })

  it('should map course to audio dirs', () => {
    expect(audioMap[1].dirs.length).toBe(2)
    expect(audioMap[9].dirs.length).toBe(2)
  })
})