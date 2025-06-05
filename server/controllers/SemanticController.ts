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

// Check if we have a similar cached response
export const checkSemanticCache: RequestHandler = async (req, res, next) => {
  console.log("0. Checking semantic cache for similar queries");

  if (!req.body.naturalLanguageQuery) {
    return next(); // No query to check, continue to normal flow
  }

  const userQuery = req.body.naturalLanguageQuery.trim();

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
    // Embed user query to vector
    console.log("1. Creating embedding for user query");
    const queryEmbedding = await createQueryEmbedding(userQuery);

    // Search cache for similar vectors
    console.log("2. Searching cache for similar queries");
    const cacheResults = await cacheIndex.query({
      vector: queryEmbedding,
      topK: 1, // Only need the most similar one
      includeMetadata: true,
    });

    // Check similarity threshold
    if (cacheResults.matches && cacheResults.matches.length > 0) {
      const bestMatch = cacheResults.matches[0];
      const similarity = bestMatch.score || 0;

      console.log(`3. Best cache match similarity: ${similarity.toFixed(3)}`);

      // Similarity ≥ 0.95? - CACHE HIT PATH
      if (similarity >= SIMILARITY_THRESHOLD && bestMatch.metadata) {
        console.log("🎯 CACHE HIT! Returning cached response");

        // Extract cached response
        const cachedResponse = {
          success: true,
          recommendation: bestMatch.metadata.llmResponse as string,
          situation: userQuery,
          mood: bestMatch.metadata.mood as string || 'funny',
          quotesFound: bestMatch.metadata.quotesFound as number || 0,
          // Parse availableQuotes back from string
          availableQuotes: JSON.parse(bestMatch.metadata.availableQuotesText as string || '[]'),
          cached: true,
          cacheMatch: {
            originalQuery: bestMatch.metadata.originalQuery as string,
            similarity: similarity,
            cachedAt: bestMatch.metadata.timestamp as number
          },
          timestamp: new Date().toISOString()
        };

        // Return cached response immediately, skip all other controllers
        res.locals.finalResponse = cachedResponse;
        res.locals.skipToEnd = true;
        
        return next();
      }
    }

    // In case of a miss, continue to normal flow
    console.log("❌ CACHE MISS - Proceeding with normal quote search");
    
    // Store query embedding for later caching
    res.locals.queryEmbedding = queryEmbedding;
    res.locals.originalQuery = userQuery;
    
    return next();

  } catch (error: any) {
    console.error("Cache lookup error:", error);
    // On cache error, continue with normal flow
    console.log("Cache error, continuing with normal flow");
    return next();
  }
};

// Save LLM response to cache after generation
export const saveToSemanticCache: RequestHandler = async (_req, res, next) => {
  console.log("16. Saving response to semantic cache");

  // Only save if we have all required data and this wasn't a cache hit
  const { finalResponse, queryEmbedding, originalQuery } = res.locals;

  if (!finalResponse || !queryEmbedding || !originalQuery || res.locals.skipToEnd) {
    console.log("Skipping cache save (missing data or was cache hit)");
    return; // Don't call next() - we're done
  }

  if (!cacheIndex) {
    console.log("Cache not available, skipping save");
    return; // Don't call next() - we're done
  }

  try {
    // Extract the LLM response text from our response object
    const llmResponse = finalResponse.recommendation || '';

    if (llmResponse.length === 0) {
      console.log("Empty LLM response, not caching");
      return; // Don't call next() - we're done
    }

    // Create unique cache entry ID
    const cacheId = `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // SAVE to cache with query embedding + essential AI response data
    const cacheVector = {
      id: cacheId,
      values: queryEmbedding,
      metadata: {
        originalQuery: originalQuery,
        llmResponse: llmResponse,
        mood: finalResponse.mood,
        quotesFound: finalResponse.quotesFound,
        // Convert availableQuotes to a simple string for storage
        availableQuotesText: JSON.stringify(finalResponse.availableQuotes),
        timestamp: Date.now(),
        queryLength: originalQuery.length
      }
    };

    await cacheIndex.upsert([cacheVector]);
    
    console.log("✅ Response saved to semantic cache");
    console.log(`Cache entry: "${originalQuery}" -> ${llmResponse.substring(0, 50)}...`);

  } catch (error: any) {
    console.error("Error saving to cache:", error);
  }
};
