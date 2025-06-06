require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// load the csv file
function loadQuotes(filePath) {
  return new Promise((resolve) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results));
  });
}

// get embeddings from openai
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// upsert embeddings to pinecone
async function upsertToPinecone(vectors) {
  const url = `${process.env.PINECONE_HOST}/vectors/upsert`;
  const response = await axios.post(
    url,
    {
      vectors,
      namespace: 'default',
    },
    {
      headers: {
        'Api-Key': process.env.PINECONE_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('Pinecone response:', response.data);
}

(async () => {
  const data = await loadQuotes('./movie_quotes.csv');
  const vectors = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const quote = row.quote;
    const movie = row.movie;
    const year = row.year;
    if (!quote) continue;

    const embedding = await getEmbedding(quote);

    vectors.push({
      id: `${i}`,
      values: embedding,
      metadata: { 
        text: quote,
        movie: movie,
        year: year
      },
    });

    if (vectors.length === 100 || i === data.length - 1) {
      await upsertToPinecone(vectors);
      vectors.length = 0;
    }
  }
})();
