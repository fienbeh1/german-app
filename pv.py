import psycopg2
import ollama
import json

def main():
    conn = psycopg2.connect(dbname="deutsch", user="f")
    cur = conn.cursor()

    cur.execute("SELECT infinitive, principal_parts FROM public.verb_conjugations;")
    rows = cur.fetchall()

    for infinitive, principal_parts in rows:
        print(f"Processing: {infinitive}")
        
        prompt = (
            f"Provide 3 example sentences for the verb '{infinitive}' using these forms: {principal_parts}. "
            "Output ONLY a raw JSON object with the format: "
            '{"examples": ["sentence1", "sentence2", "sentence3"]}. '
            "Do not include any extra text, markdown, or explanations."
        )
        
        response = ollama.chat(model='mistral', messages=[{'role': 'user', 'content': prompt}])
        content = response['message']['content'].strip()
        
        # Clean up markdown code blocks if the model adds them
        if content.startswith("```"):
            content = content.replace("```json", "").replace("```", "").strip()

        try:
            json_data = json.loads(content)
            cur.execute(
                "UPDATE public.verb_conjugations SET examples = %s WHERE infinitive = %s;",
                (json.dumps(json_data), infinitive)
            )
            conn.commit()
            print(f"Updated {infinitive}")
        except json.JSONDecodeError:
            print(f"Failed to parse JSON for {infinitive}. Raw output: {content}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
