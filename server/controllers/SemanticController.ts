import { RequestHandler } from 'express';
import { ServerError } from '../types/Types.js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Cache index configuration
const CACHE_INDEX_NAME = 'cache'; 
const SIMILARITY_THRESHOLD = 0.95; // Changed from 0.85 to 0.95 for higher precision

let cacheIndex: any = null;

// Initialize cache index with host
if (process.env.PINECONE_CACHE_HOST) {
  try {
    cacheIndex = pinecone.Index(CACHE_INDEX_NAME, process.env.PINECONE_CACHE_HOST);
    console.log(`Connected to cache index: ${CACHE_INDEX_NAME} at ${process.env.PINECONE_CACHE_HOST}`);
  } catch (error) {
    console.error("Could not connect to cache index with host:", error);
  }
} else {
  try {
    cacheIndex = pinecone.Index(CACHE_INDEX_NAME);
    console.log(`Connected to cache index: ${CACHE_INDEX_NAME}`);
  } catch (error) {
    console.error("Could not connect to cache index:", error);
  }
}

// Cost calculation function with real 2025 prices
function calculateOpenAICost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = {
    'gpt-4o': {
      input: 0.005 / 1000,   // $5.00 per 1M tokens = $0.005 per 1K
      output: 0.02 / 1000    // $20.00 per 1M tokens = $0.02 per 1K
    },
    'text-embedding-3-small': {
      input: 0.00002 / 1000, // $0.02 per 1M tokens = $0.00002 per 1K  
      output: 0              // Embeddings don't have output tokens
    }
  };
  
  const modelCost = costs[model] || costs['gpt-4o'];
  return (inputTokens * modelCost.input) + (outputTokens * modelCost.output);
}

// Estimate tokens from text (rough approximation: 4 chars = 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Create embedding for user query
async function createQueryEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.trim(),
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error creating query embedding:", error);
    throw new Error("Failed to create embedding for cache lookup");
  }
}

// ADDED: Function to track actual savings
async function trackActualSavings(costSaved: number) {
  if (!cacheIndex) {
    console.log("Cache not available for savings tracking");
    return;
  }

  try {
    const savingsId = `savings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create a savings tracking entry
    const savingsVector = {
      id: savingsId,
      values: new Array(1536).fill(0), // Dummy vector for savings tracking
      metadata: {
        type: 'actual_savings',
        costSaved: costSaved,
        timestamp: Date.now(),
        date: new Date().toISOString()
      }
    };

    await cacheIndex.upsert([savingsVector]);
    console.log(`📊 Actual savings tracked: $${costSaved.toFixed(6)}`);
  } catch (error) {
    console.error("Error tracking actual savings:", error);
  }
}

// Check if we have a similar cached response (track actual savings)
export const checkSemanticCache: RequestHandler = async (req, res, next) => {
  console.log("0. Checking semantic cache for similar queries");

  if (!req.body.naturalLanguageQuery) {
    return next(); // No query to check, continue to normal flow
  }

  const userQuery = req.body.naturalLanguageQuery.trim();
  const userMood = req.body.mood || 'funny'; // Get the user-selected mood

  // Skip cache for very short or generic queries
  if (userQuery.length < 10) {
    console.log("Query too short for cache, skipping");
    return next();
  }

  if (!cacheIndex) {
    console.log("Cache not available, skipping to normal flow");
    return next();
  }

  try {
    // Create a query that includes mood for more precise matching
    const queryWithMood = `${userQuery} mood:${userMood}`;
    console.log("1. Creating embedding for user query with mood:", queryWithMood);
    const queryEmbedding = await createQueryEmbedding(queryWithMood);

    // Calculate embedding cost
    const embeddingTokens = estimateTokens(queryWithMood);
    const embeddingCost = calculateOpenAICost('text-embedding-3-small', embeddingTokens, 0);

    // Search cache for similar vectors
    console.log("2. Searching cache for similar queries");
    const cacheResults = await cacheIndex.query({
      vector: queryEmbedding,
      topK: 3, // Get top 3 to check mood matches
      includeMetadata: true,
    });

    // Check similarity threshold AND mood match
    if (cacheResults.matches && cacheResults.matches.length > 0) {
      // Find a match with both high similarity AND matching mood
      for (const match of cacheResults.matches) {
        const similarity = match.score || 0;
        const cachedMood = match.metadata?.mood || 'funny';

        console.log(`3. Cache match similarity: ${similarity.toFixed(3)}, mood: ${cachedMood} vs ${userMood}`);

        // Require both high similarity AND mood match
        if (similarity >= SIMILARITY_THRESHOLD && cachedMood === userMood && match.metadata) {
          console.log("🎯 CACHE HIT! Returning cached response (query + mood match)");

          // Get cached cost information
          const cachedCost = match.metadata.estimatedCost as number || 0;
          console.log(`💰 Cost saved: $${cachedCost.toFixed(6)}`);

          // Track this as an actual savings event
          await trackActualSavings(cachedCost);

          // Extract cached response
          const cachedResponse = {
            success: true,
            recommendation: match.metadata.llmResponse as string,
            situation: userQuery,
            mood: cachedMood,
            quotesFound: match.metadata.quotesFound as number || 0,
            // Parse availableQuotes back from string
            availableQuotes: JSON.parse(match.metadata.availableQuotesText as string || '[]'),
            cached: true,
            cacheMatch: {
              originalQuery: match.metadata.originalQuery as string,
              similarity: similarity,
              cachedAt: match.metadata.timestamp as number,
              costSaved: cachedCost
            },
            timestamp: new Date().toISOString()
          };

          // Return cached response immediately, skip all other controllers
          res.locals.finalResponse = cachedResponse;
          res.locals.skipToEnd = true;
          
          return next();
        }
      }
    }

    // In case of a miss, continue to normal flow
    console.log("❌ CACHE MISS - No matching query+mood combination found");
    
    // Store query embedding and cost for later caching
    res.locals.queryEmbedding = queryEmbedding;
    res.locals.originalQuery = userQuery;
    res.locals.embeddingCost = embeddingCost;
    res.locals.userMood = userMood; // Store mood for saving later
    
    return next();

  } catch (error: any) {
    console.error("Cache lookup error:", error);
    // On cache error, continue with normal flow
    console.log("Cache error, continuing with normal flow");
    return next();
  }
};

// Save LLM response to cache after generation (UPDATED: Mood-aware saving)
export const saveToSemanticCache: RequestHandler = async (_req, res, next) => {
  console.log("16. Saving response to semantic cache with mood-aware cost tracking");

  // Only save if we have all required data and this wasn't a cache hit
  const { finalResponse, queryEmbedding, originalQuery, embeddingCost, userMood } = res.locals;

  if (!finalResponse || !queryEmbedding || !originalQuery || res.locals.skipToEnd) {
    console.log("Skipping cache save (missing data or was cache hit)");
    return; // Don't call next()
  }

  if (!cacheIndex) {
    console.log("Cache not available, skipping save");
    return; // Don't call next()
  }

  try {
    // Extract the LLM response text from our response object
    const llmResponse = finalResponse.recommendation || '';

    if (llmResponse.length === 0) {
      console.log("Empty LLM response, not caching");
      return; // Don't call next()
    }

    // Calculate estimated cost for this query
    const queryWithMood = `${originalQuery} mood:${userMood || finalResponse.mood}`;
    const inputTokens = estimateTokens(queryWithMood);
    const outputTokens = estimateTokens(llmResponse);
    const llmCost = calculateOpenAICost('gpt-4o', inputTokens, outputTokens);
    const totalCost = llmCost + (embeddingCost || 0);

    // Create unique cache entry ID
    const cacheId = `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save with mood-aware query for better matching
    const cacheVector = {
      id: cacheId,
      values: queryEmbedding, // This was created with mood included
      metadata: {
        type: 'cached_response', // Mark as cached response (not savings tracking)
        originalQuery: originalQuery,
        queryWithMood: queryWithMood, // Store the mood-enhanced query
        llmResponse: llmResponse,
        mood: finalResponse.mood,
        quotesFound: finalResponse.quotesFound,
        // Convert availableQuotes to a simple string for storage
        availableQuotesText: JSON.stringify(finalResponse.availableQuotes),
        timestamp: Date.now(),
        queryLength: originalQuery.length,
        estimatedCost: totalCost, // Total cost including embedding + LLM
        inputTokens: inputTokens,
        outputTokens: outputTokens
      }
    };

    await cacheIndex.upsert([cacheVector]);
    
    console.log("✅ Response saved to semantic cache with mood-aware matching");
    console.log(`Cache entry: "${originalQuery}" + "${finalResponse.mood}" -> ${llmResponse.substring(0, 50)}...`);
    console.log(`💰 Estimated cost saved for future queries: $${totalCost.toFixed(6)}`);

  } catch (error: any) {
    console.error("Error saving to cache:", error);
  }
};