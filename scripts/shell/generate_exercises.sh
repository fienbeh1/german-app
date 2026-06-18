#!/bin/bash
# Generate grammar exercises via Mistral and insert into ejercicios table

set -e

DB="psql -d deutsch -U f"

echo "=== Generating grammar exercises via Mistral ==="

# Course definitions: id|name|level|topics
# Topic is a comma-separated list of grammar topics for the course level
COURSES=(
  "1|Lagune 1|A1|articles der die das, present tense conjugation, sein haben, plural forms, word order, personal pronouns, accusative, modal verbs können müssen, prepositions in auf"
  "2|Lagune 2|A2|past tense Präteritum, Perfekt with haben sein, separable prefix verbs, dative case, temporal prepositions, adjective declension, comparative superlative, subjunctive Konjunktiv II würde"
  "3|Lagune 3|B1|passive voice, relative clauses, Konjunktiv II past, indirect questions, n-declension, genitive case, two-way prepositions, infinitive clauses um zu"
  "4|Tangram Aktuell 1|A1|articles, present tense, personal pronouns, accusative, modal verbs, plural, imperative, possessive articles"
  "5|Tangram Aktuell 2|A2|Perfekt, Präteritum, dative, adjective declension, comparative, prepositions, reflexive verbs, subordinate clauses"
  "6|Tangram Aktuell 3|B1|passive, relative clauses, Konjunktiv II, infinitive clauses, indirect speech, genitive, conditional sentences"
  "7|Menschen A1|A1|present tense, articles, sein haben, modal verbs, imperative, plural, word order, prepositions"
  "8|Menschen A2|A2|Perfekt, Präteritum, dative, adjective endings, comparative, prepositions, reflexive, subordinate clauses weil dass"
  "9|EM B2|B2|Konjunktiv I, indirect speech, passive alternatives, Nomen-Verb-Verbindungen, extended attributes, sentence construction, academic German"
  "10|C1|C1|nominalization, participial constructions, advanced passive, subjunctive nuances, stylistic devices, complex conjunctions"
)

for COURSE in "${COURSES[@]}"; do
  ID="${COURSE%%|*}"
  REST="${COURSE#*|}"
  NAME="${REST%%|*}"
  REST="${REST#*|}"
  LEVEL="${REST%%|*}"
  TOPICS="${REST#*|}"

  echo ""
  echo "--- Generating exercises for $NAME ($LEVEL) ---"

  # Generate 10 exercises for this course level
  PROMPT="Generate exactly 10 German grammar exercises for level $LEVEL ($NAME).
Topics to cover: $TOPICS

For each exercise, provide:
- numero: a number from 1 to 10
- tipo: one of 'articles', 'conjugation', 'prepositions', 'word-order', 'declension', 'passive', 'relative-clauses', 'subjunctive', 'sentence-completion'
- titulo: short title in German describing the exercise (max 60 chars)
- texto: the exercise text in German. Use ___ for blanks, provide options in [brackets], or ask a direct question. Be specific and include the answer context.
- instrucciones: instructions in German (max 100 chars)

IMPORTANT: Output ONLY valid JSON array. No markdown, no explanations, no extra text.
Each object in the array must have exactly these keys: numero, tipo, titulo, texto, instrucciones

Example:
[{\"numero\":1,\"tipo\":\"articles\",\"titulo\":\"Bestimmter Artikel\",\"texto\":\"___ Hund ist braun. (der/die/das)\",\"instrucciones\":\"Setze den richtigen Artikel ein\"}]"

  echo "Running Mistral..."
  OUTPUT=$(echo "$PROMPT" | ollama run mistral 2>/dev/null)
  
  # Try to extract JSON array from the output
  # Remove markdown code blocks if present
  CLEAN=$(echo "$OUTPUT" | sed '/^```/,/^```/d' | tr -d '\n' | sed 's/.*\(\[.*\]\).*/\1/' 2>/dev/null || echo "$OUTPUT")
  
  # Validate with jq
  echo "$CLEAN" | jq . > /dev/null 2>&1 || {
    echo "WARNING: Invalid JSON from Mistral for $NAME. Saving raw output and trying manual parsing..."
    echo "$OUTPUT" > /tmp/mistral_raw_${ID}.txt
    # Try to find JSON array in the output
    CLEAN=$(echo "$OUTPUT" | python3 -c "
import sys, re, json
text = sys.stdin.read()
# Find first [ and last ]
start = text.find('[')
end = text.rfind(']')
if start >= 0 and end > start:
    try:
        data = json.loads(text[start:end+1])
        print(json.dumps(data))
    except:
        # Try to fix common issues
        fixed = text[start:end+1]
        print(fixed)
else:
    print('[]')
" 2>/dev/null)
  }
  
  echo "$CLEAN" | jq . > /dev/null 2>&1 || {
    echo "ERROR: Could not parse JSON for $NAME. Skipping."
    continue
  }
  
  # Insert each exercise into the database
  COUNT=$(echo "$CLEAN" | jq '. | length')
  echo "Inserting $COUNT exercises for $NAME..."
  
  for i in $(seq 0 $((COUNT - 1))); do
    NUMERO=$(echo "$CLEAN" | jq -r ".[$i].numero // $((i+1))")
    TIPO=$(echo "$CLEAN" | jq -r ".[$i].tipo // \"grammar\"")
    TITULO=$(echo "$CLEAN" | jq -r ".[$i].titulo // \"Übung $NUMERO\"")
    TEXTO=$(echo "$CLEAN" | jq -r ".[$i].texto // \"\"" | sed "s/'/''/g")
    INSTR=$(echo "$CLEAN" | jq -r ".[$i].instrucciones // \"\"" | sed "s/'/''/g")
    
    $DB -c "INSERT INTO ejercicios (curso_id, numero, tipo, titulo, texto, instrucciones)
            VALUES ($ID, $NUMERO, '$TIPO', '$TITULO', '$TEXTO', '$INSTR')
            ON CONFLICT DO NOTHING;" 2>/dev/null || true
  done
  
  echo "Done: $COUNT exercises for $NAME"
done

echo ""
echo "=== Generation complete ==="
$DB -c "SELECT c.nombre, COUNT(e.id) as count FROM ejercicios e JOIN cursos c ON c.id = e.curso_id GROUP BY c.nombre ORDER BY c.nombre;"
