// server/controllers/semanticCacheController.ts
import { RequestHandler } from 'express';
import { ServerError } from '../types';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize clients
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Separate namespace for cache in Pinecone
const CACHE_INDEX_NAME = 'movie-quotes-cache'; 
const SIMILARITY_THRESHOLD = 0.85; // Cache hit threshold from your flow

let cacheIndex: any = null;

try {
  cacheIndex = pinecone.Index(CACHE_INDEX_NAME);
  console.log(`Connected to cache index: ${CACHE_INDEX_NAME}`);
} catch (error) {
  console.error("Could not connect to cache index:", error);
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

    // Search cache namespace for similar vectors
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

      // Similarity ≥ 0.85? - CACHE HIT PATH
      if (similarity >= SIMILARITY_THRESHOLD && bestMatch.metadata) {
        console.log("🎯 CACHE HIT! Returning cached response");

        // Extract cached response
        const cachedResponse = {
          success: true,
          recommendation: bestMatch.metadata.llmResponse as string,
          situation: userQuery,
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

// Miss - save LLM response to cache after generation
export const saveToSemanticCache: RequestHandler = async (_req, res, next) => {
  console.log("16. Saving response to semantic cache");

  // Only save if we have all required data and this wasn't a cache hit
  const { finalResponse, queryEmbedding, originalQuery } = res.locals;

  if (!finalResponse || !queryEmbedding || !originalQuery || res.locals.skipToEnd) {
    console.log("Skipping cache save (missing data or was cache hit)");
    return next();
  }

  if (!cacheIndex) {
    console.log("Cache not available, skipping save");
    return next();
  }

  try {
    // Extract the LLM response text from our response object
    const llmResponse = finalResponse.recommendation || '';

    if (llmResponse.length === 0) {
      console.log("Empty LLM response, not caching");
      return next();
    }

    // Create unique cache entry ID
    const cacheId = `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // SAVE to cache namespace with query embedding and LLM response
    const cacheVector = {
      id: cacheId,
      values: queryEmbedding,
      metadata: {
        originalQuery: originalQuery,
        llmResponse: llmResponse,
        timestamp: Date.now(),
        queryLength: originalQuery.length
      }
    };

    await cacheIndex.upsert([cacheVector]);
    
    console.log("✅ Response saved to semantic cache");
    console.log(`Cache entry: "${originalQuery}" -> ${llmResponse.substring(0, 50)}...`);

  } catch (error: any) {
    console.error("Error saving to cache:", error);
    // Don't fail the request if cache save fails
  }

  return next();
};

// Utility function to clear old cache entries (optional)
export const clearOldCacheEntries = async (olderThanDays: number = 30): Promise<void> => {
  if (!cacheIndex) {
    throw new Error("Cache index not available");
  }

  const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  
  try {
    // This would require fetching all entries and filtering - 
    // implementation depends on your cache management strategy
    console.log(`Clearing cache entries older than ${olderThanDays} days`);
    
    // For now, just log - you might want to implement this based on your needs
    console.log("Cache cleanup not implemented yet");
    
  } catch (error) {
    console.error("Error clearing old cache entries:", error);
  }
};