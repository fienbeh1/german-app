const { Pool } = require('pg');
const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });

async function extractAnswers() {
  for (const cursoId of [1, 2, 4, 5, 6, 8]) {
    // Find Lösungen page
    const losung = await pool.query(`
      SELECT texto_extraido FROM archivos 
      WHERE tipo = 'ocr' AND curso_id = $1 AND texto_extraido LIKE '%Lösungsschlüssel%'
      ORDER BY pagina DESC LIMIT 1
    `, [cursoId]);
    
    if (losung.rows.length === 0) {
      console.log(`Course ${cursoId}: no Lösungen found`);
      continue;
    }
    
    const text = losung.rows[0].texto_extraido;
    const answers = [];
    
    // Extract patterns like: "a. something", "b. something", "1. something"
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9]+)\.\s+(.+)/);
      if (match && match[2].length > 2 && match[2].length < 100) {
        answers.push(match[1].toLowerCase() + '. ' + match[2].substring(0, 80));
      }
    }
    
    console.log(`Course ${cursoId}: found ${answers.length} answers`);
    
    // Update exercises with answers
    const exercises = await pool.query(`
      SELECT id, pregunta FROM parsed_exercises 
      WHERE curso_id = $1 AND respuesta IS NULL
      ORDER BY id LIMIT $2
    `, [cursoId, answers.length]);
    
    for (let i = 0; i < exercises.rows.length && i < answers.length; i++) {
      await pool.query(`
        UPDATE parsed_exercises SET respuesta = $1 WHERE id = $2
      `, [answers[i], exercises.rows[i].id]);
    }
  }
  
  const count = await pool.query(`SELECT COUNT(*) as c FROM parsed_exercises WHERE respuesta IS NOT NULL AND respuesta != ''`);
  console.log(`Total with answers: ${count.rows[0].c}`);
  
  pool.end();
}

extractAnswers().catch(console.error);
