const axios = require('axios');

// Configuration
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'qwen_linguist:latest';
const TIMEOUT_MS = 30000; // 30 second timeout (adjust as needed)

async function testQwenQuery() {
  const testPrompt = `Return ONLY valid JSON with grammar topics for this German text: "Ich habe ein Buch gekauft." Format: {"grammar": ["..."]}`;

  try {
    const response = await axios.post(
      OLLAMA_URL,
      {
        model: MODEL,
        prompt: testPrompt,
        stream: false,
        format: 'json'
      },
      { timeout: TIMEOUT_MS }
    );

    console.log('✅ Qwen Test Passed. Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    // Handle timeout explicitly
    if (error.code === 'ECONNABORTED') {
      console.error(`❌ TIMEOUT ERROR: Request to ${MODEL} timed out after ${TIMEOUT_MS}ms. Exiting.`);
    } else if (error.response) {
      console.error(`❌ API ERROR: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`❌ CONNECTION ERROR: ${error.message}`);
    }
    process.exit(1); // Exit immediately, no retries
  }
}

testQwenQuery();
