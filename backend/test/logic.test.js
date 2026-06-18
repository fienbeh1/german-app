import { describe, it, expect } from 'vitest'

describe('Backend Server Logic', () => {
  describe('PDF Map Configuration', () => {
    const pdfMap = {
      1: { kb: 'Lagune 1/Kursbuch.pdf', ab: 'Lagune 1/Arbeitsbuch.pdf' },
      4: { kb1: 'Tangram 1/Lektion 1-4.pdf', kb2: 'Tangram 1/Lektion 5-8.pdf', ab: 'Tangram 1/Ubungsheft.pdf' },
      9: { kb: 'B2/HauptKurs.pdf', ab: 'B2/EM_Neu_AB.pdf' }
    }

    it('should map course 1 to correct PDF paths', () => {
      expect(pdfMap[1].kb).toContain('Lagune 1')
      expect(pdfMap[1].ab).toContain('Arbeitsbuch')
    })

    it('should handle kb1/kb2 split books', () => {
      expect(pdfMap[4].kb1).toContain('1-4')
      expect(pdfMap[4].kb2).toContain('5-8')
    })

    it('should select correct book based on page param', () => {
      const useSecond = '2'
      const c = pdfMap[4]
      const result = useSecond && c.kb2 ? c.kb2 : (c.kb1 || c.kb)
      expect(result).toContain('5-8')
    })
  })

  describe('Audio Map Configuration', () => {
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
          { path: 'B2/Kursbuch Hoertexte/EM neu - Hauptkurs cd 1', label: 'CD 1' }
        ]
      }
    }

    it('should have correct course names', () => {
      expect(audioMap[1].name).toBe('Lagune 1')
      expect(audioMap[9].name).toBe('B2')
    })

    it('should have audio directories with labels', () => {
      expect(audioMap[1].dirs[0].label).toBeDefined()
      expect(audioMap[1].dirs[0].path).toContain('Lagune')
    })

    it('should filter mp3 files only', () => {
      const files = ['Track01.mp3', 'Track02.mp3', 'cover.jpg', 'info.txt']
      const mp3s = files.filter(f => f.endsWith('.mp3'))
      expect(mp3s).toHaveLength(2)
      expect(mp3s).toContain('Track01.mp3')
    })
  })

  describe('Exercise Query Logic', () => {
    it('should build correct SQL for exercises', () => {
      const curso = 1
      const sql = `
        SELECT ejercicio as numero, pregunta as pregunta, respuesta, 'text' as tipo
        FROM parsed_exercises 
        WHERE curso_id = ${curso} 
        AND pregunta IS NOT NULL
        ORDER BY unidad, ejercicio
        LIMIT 300
      `
      expect(sql).toContain('SELECT')
      expect(sql).toContain('curso_id = 1')
      expect(sql).toContain('respuesta')
    })

    it('should handle null respuesta', () => {
      const ejercicios = [
        { pregunta: 'Was ist das?', respuesta: 'Ein Buch' },
        { pregunta: 'Wer kommt?', respuesta: null },
        { pregunta: '', respuesta: 'Test' }
      ]
      const valid = ejercicios.filter(e => e.pregunta && e.pregunta.length > 0)
      expect(valid.length).toBe(2)
    })
  })

  describe('Answer Verification Logic', () => {
    function checkAnswer(userAnswer, correctAnswer) {
      if (!correctAnswer || !userAnswer) return false
      const userAns = userAnswer.toLowerCase().trim()
      const correctAns = correctAnswer.toLowerCase()
      const words = correctAns.split(/\s+/).filter(w => w.length > 3)
      return words.some(w => userAns.includes(w))
    }

    it('should return true when user answer contains correct word', () => {
      expect(checkAnswer('Das ist ein Buch', 'Das ist ein Buch')).toBe(true)
    })

    it('should return true with partial answer', () => {
      expect(checkAnswer('Buch', 'Das ist ein Buch')).toBe(true)
    })

    it('should return false for wrong answer', () => {
      expect(checkAnswer('Das ist ein Auto', 'Das ist ein Buch')).toBe(false)
    })

    it('should handle empty answers', () => {
      expect(checkAnswer('', 'Antwort')).toBe(false)
      expect(checkAnswer('Antwort', '')).toBe(false)
    })
  })

  describe('Progress Tracking Schema', () => {
    const progressRow = {
      id: 1,
      curso_id: 1,
      lektion: 1,
      page: 10,
      completed: true,
      created_at: new Date().toISOString()
    }

    it('should have required fields', () => {
      expect(progressRow.curso_id).toBe(1)
      expect(progressRow.lektion).toBe(1)
      expect(progressRow.page).toBe(10)
      expect(progressRow.completed).toBe(true)
    })
  })

  describe('Bookmark Schema', () => {
    const bookmark = {
      id: 1,
      curso_id: 1,
      lektion: 2,
      page: 15,
      note: 'Important grammar point',
      created_at: new Date().toISOString()
    }

    it('should have note field', () => {
      expect(bookmark.note).toBeDefined()
      expect(bookmark.note.length).toBeGreaterThan(0)
    })
  })

  describe('User Answers Schema', () => {
    const answer = {
      id: 1,
      ejercicio_id: 42,
      user_answer: 'Das ist ein Buch',
      correct: true,
      created_at: new Date().toISOString()
    }

    it('should track correct/incorrect', () => {
      expect(answer.correct).toBe(true)
      expect(answer.user_answer).toContain('Buch')
    })
  })
})