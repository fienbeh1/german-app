const { Pool } = require('pg');
const pool = new Pool({ user: 'f', host: '/var/run/postgresql', database: 'deutsch' });

async function run() {
  const tk = await pool.query('SELECT id, curso_id, numero FROM themenkreise ORDER BY curso_id, numero');
  console.log('Found', tk.rows.length, 'themenkreise');

  for (const row of tk.rows) {
    const numUnits = row.curso_id <= 2 ? 4 : 2;
    for (let i = 1; i <= numUnits; i++) {
      const foco = ['Strukturen', 'Lesen', 'Hören/Sprechen', 'Wiederholung'][i-1] || 'Übung';
      const paginas = ((i-1)*4+1) + '-' + (i*4);
      const esAnker = i === numUnits;
      
      await pool.query(
        'INSERT INTO lerneinheiten (themenkreis_id, numero, titulo, fokus, paginas, es_anker) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, i, 'Einheit ' + i, foco, paginas, esAnker]
      );
    }
  }

  const le = await pool.query('SELECT COUNT(*) as cnt FROM lerneinheiten');
  console.log('Loaded', le.rows[0].cnt, 'lerneinheiten');
  pool.end();
}

run();