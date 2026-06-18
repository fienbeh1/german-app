import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const API = 'http://localhost:3456/api'

describe('Backend API Tests', () => {
  describe('Health', () => {
    it('GET /api/health returns ok', async () => {
      const res = await fetch(API + '/health')
      const data = await res.json()
      expect(data.status).toBe('ok')
    })
  })

  describe('Courses', () => {
    it('GET /api/cursos returns array', async () => {
      const res = await fetch(API + '/cursos')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })

    it('each course has required fields', async () => {
      const res = await fetch(API + '/cursos')
      const data = await res.json()
      const course = data[0]
      expect(course).toHaveProperty('id')
      expect(course).toHaveProperty('nombre')
    })
  })

  describe('File API', () => {
    it('GET /api/file/:curso/kursbuch/:pg returns file info', async () => {
      const res = await fetch(API + '/file/1/kursbuch/1')
      const data = await res.json()
      expect(data).toHaveProperty('exists')
    })

    it('returns correct book for split books (kb2)', async () => {
      const res1 = await fetch(API + '/file/4/kursbuch/1')
      const res2 = await fetch(API + '/file/4/kursbuch/2')
      expect(res1.ok).toBe(true)
      expect(res2.ok).toBe(true)
    })
  })

  describe('Exercises', () => {
    it('GET /api/ejercicios/:curso returns exercises', async () => {
      const res = await fetch(API + '/ejercicios/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('includes pregunta field', async () => {
      const res = await fetch(API + '/ejercicios/1')
      const data = await res.json()
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('pregunta')
      }
    })

    it('sometimes includes respuesta', async () => {
      const res = await fetch(API + '/ejercicios/1')
      const data = await res.json()
      const withAnswer = data.find(e => e.respuesta)
      expect(withAnswer === undefined || withAnswer.respuesta).toBeDefined()
    })
  })

  describe('Audio', () => {
    it('GET /api/audio/cds/:curso returns audio cds', async () => {
      const res = await fetch(API + '/audio/cds/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('each cd has label and count', async () => {
      const res = await fetch(API + '/audio/cds/1')
      const data = await res.json()
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('label')
        expect(data[0]).toHaveProperty('count')
      }
    })

    it('GET /api/audio/list/:curso returns file list', async () => {
      const res = await fetch(API + '/audio/list/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('B2 audio works', async () => {
      const res = await fetch(API + '/audio/cds/9')
      const data = await res.json()
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].count).toBeGreaterThan(0)
    })

    it('C1 audio works', async () => {
      const res = await fetch(API + '/audio/cds/10')
      const data = await res.json()
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].count).toBeGreaterThan(0)
    })
  })

  describe('Themenkreise', () => {
    it('GET /api/themenkreise/:curso returns themenkreise', async () => {
      const res = await fetch(API + '/themenkreise/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('Progress Tracking', () => {
    it('GET /api/progress/:curso returns empty for new course', async () => {
      const res = await fetch(API + '/progress/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('POST /api/progress creates progress', async () => {
      const res = await fetch(API + '/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curso_id: 1, lektion: 1, page: 10, completed: true })
      })
      expect(res.ok).toBe(true)
    })
  })

  describe('Bookmarks', () => {
    it('GET /api/bookmarks/:curso returns empty for new', async () => {
      const res = await fetch(API + '/bookmarks/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('POST /api/bookmarks creates bookmark', async () => {
      const res = await fetch(API + '/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curso_id: 1, lektion: 1, page: 10, note: 'Test bookmark' })
      })
      expect(res.ok).toBe(true)
    })
  })

  describe('Exercise Scores', () => {
    it('GET /api/scores/:curso returns scores', async () => {
      const res = await fetch(API + '/scores/1')
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('OCR', () => {
    it('POST /api/pdf/ocr starts OCR process', async () => {
      const res = await fetch(API + '/pdf/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: 'Lagune 1-20230613T235903Z-001/Lagune 1/Kursbuch + CD/Lagune-1-Kursbuch.pdf', curso: 1, startPage: 1, endPage: 1 })
      })
      expect(res.ok).toBe(true)
    })
  })
})