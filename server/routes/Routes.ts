import express from 'express';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

import { parseMovieQuoteRequest } from '../controllers/ParserController.js';
import { checkSemanticCache, saveToSemanticCache } from '../controllers/SemanticController.js';
import { searchMovieQuotes } from '../controllers/FinderController.js';
import { 
  generateMovieQuoteResponse, 
  sendMovieQuoteResponse,
  searchByActor,
  generateActorResponse,
  searchByMovie,
  generateMovieResponse,
  sendResponse
} from '../controllers/ResponseController.js';

const router = express.Router();

// Initialize Pinecone for cost tracking endpoint
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
});

// Main movie quotes endpoint (situation-based search with semantic caching)
router.post('/movie-quotes', 
  // Step 1: Parse the request and extract situation/mood
  parseMovieQuoteRequest,
  
  // Step 2: Check if we have a cached response for similar queries
  checkSemanticCache,
  
  // Step 3: Search for relevant movie quotes
  searchMovieQuotes,
  
  // Step 4: Generate AI response with the found quotes
  generateMovieQuoteResponse,
  
  // Step 5: Send response (handles both cache hits and normal responses)
  sendMovieQuoteResponse,
  
  // Step 6: Save to cache for future similar queries (only for non-cached responses)
  saveToSemanticCache
);

// Actor-based search endpoint (clean controller chain)
router.post('/search-by-actor',
  // Step 1-8: Search for quotes by actor
  searchByActor,
  
  // Step 9-11: Generate AI response to verify actor quotes
  generateActorResponse,
  
  // Step 12: Send response
  sendResponse
);

// Movie-based search endpoint (clean controller chain)
router.post('/search-by-movie',
  // Step 1-9: Search for quotes by movie
  searchByMovie,
  
  // Step 10-12: Generate AI response to verify movie quotes
  generateMovieResponse,
  
  // Step 12: Send response
  sendResponse
);

// UPDATED: Cache statistics with actual vs potential savings
router.get('/cache-stats', async (req, res) => {
  console.log("Cache stats endpoint called");
  
  try {
    // Connect to cache index
    let cacheIndex: any = null;
    
    if (process.env.PINECONE_CACHE_HOST) {
      cacheIndex = pinecone.Index('cache', process.env.PINECONE_CACHE_HOST);
    } else {
      cacheIndex = pinecone.Index('cache');
    }

    if (!cacheIndex) {
      return res.status(503).json({
        success: false,
        message: 'Cache not available'
      });
    }

    console.log("Getting cache statistics...");
    
    // Get cache statistics
    const stats = await cacheIndex.describeIndexStats();
    
    // Query cache entries to calculate both potential and actual savings
    const allCacheEntries = await cacheIndex.query({
      vector: new Array(1536).fill(0.01), // Dummy vector
      topK: 10000, // Get many entries to capture all data
      includeMetadata: true
    });

    let potentialSavings = 0;
    let actualSavings = 0;
    let totalCachedQueries = 0;
    let savingsEvents = 0;

    if (allCacheEntries.matches) {
      allCacheEntries.matches.forEach(match => {
        if (match.metadata?.type === 'actual_savings') {
          // This is a savings tracking entry (when someone got a cache hit)
          actualSavings += match.metadata.costSaved as number;
          savingsEvents++;
        } else if (match.metadata?.type === 'cached_response' || match.metadata?.estimatedCost) {
          // This is a cached query entry (potential future savings)
          potentialSavings += match.metadata.estimatedCost as number || 0;
          totalCachedQueries++;
        }
      });
    }

    console.log(`Cache stats: ${totalCachedQueries} cached queries, $${actualSavings.toFixed(6)} actual savings from ${savingsEvents} cache hits`);

    res.json({
      success: true,
      cacheStats: {
        totalEntries: stats.totalVectorCount || 0,
        totalCachedQueries: totalCachedQueries,
        potentialSavings: potentialSavings, // Total value of all cached responses
        actualSavings: actualSavings, // Real money saved from cache hits
        cacheHitsCount: savingsEvents, // Number of times cache was used
        averageSavingsPerHit: savingsEvents > 0 ? actualSavings / savingsEvents : 0,
        efficiencyRatio: potentialSavings > 0 ? (actualSavings / potentialSavings) * 100 : 0, // What % of potential has been realized
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error("Cache stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get cache statistics'
    });
  }
});

// Test endpoint to check if API is working
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Movie Quotes API is working!',
    timestamp: new Date().toISOString()
  });
});

// Test Pinecone connection
router.get('/test-pinecone', async (req, res) => {
  try {
    if (!process.env.PINECONE_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'PINECONE_API_KEY not set',
        message: 'Pinecone API key missing from environment'
      });
    }

    if (!process.env.PINECONE_INDEX) {
      return res.status(500).json({
        success: false,
        error: 'PINECONE_INDEX not set', 
        message: 'Pinecone index name missing from environment'
      });
    }

    if (!process.env.PINECONE_HOST) {
      return res.status(500).json({
        success: false,
        error: 'PINECONE_HOST not set',
        message: 'Pinecone host missing from environment'
      });
    }

    const indexName = process.env.PINECONE_INDEX;
    const index = pinecone.Index(indexName, process.env.PINECONE_HOST);
    
    const stats = await index.describeIndexStats();
    
    res.json({
      success: true,
      indexName: indexName,
      host: process.env.PINECONE_HOST,
      indexStats: stats,
      message: 'Pinecone connection working',
      vectorCount: stats.totalVectorCount || 0
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Pinecone connection failed'
    });
  }
});

// Simple test with minimal parameters
router.get('/test-simple', async (req, res) => {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST!);
    
    // Most basic possible query in 'default' namespace
    const simpleVector = new Array(1536).fill(0.01); // Very small values
    
    const result = await index.namespace('default').query({
      vector: simpleVector,
      topK: 3 // Very small number
    });
    
    res.json({
      success: true,
      message: 'Simplest possible query test (default namespace)',
      resultCount: result.matches?.length || 0,
      matches: result.matches || [],
      queryVector: simpleVector.slice(0, 5) // Show first 5 values
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Simple test failed'
    });
  }
});

// Test with new API key using exact quote text
router.get('/test-new-key', async (req, res) => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });

    const index = pinecone.Index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST!);
    
    const results: any = {};
    
    // Test 1: Try to fetch the known record from 'default' namespace
    try {
      const fetchResult = await index.namespace('default').fetch(['quote-103']);
      results.fetch_test = {
        success: true,
        found: Object.keys(fetchResult.records || {}).length > 0,
        record: fetchResult.records?.['quote-103'] || null
      };
    } catch (error: any) {
      results.fetch_test = { success: false, error: error.message };
    }
    
    // Test 2: Try vector search with exact quote in 'default' namespace
    try {
      const quoteText = "You idiots! These are not them! You've captured their stunt doubles!";
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: quoteText,
      });
      
      const searchResult = await index.namespace('default').query({
        vector: embedding.data[0].embedding,
        topK: 5,
        includeMetadata: true
      });
      
      results.vector_search = {
        success: true,
        searchedFor: quoteText,
        resultCount: searchResult.matches?.length || 0,
        results: searchResult.matches?.slice(0, 3) || []
      };
    } catch (error: any) {
      results.vector_search = { success: false, error: error.message };
    }
    
    // Test 3: Basic stats
    try {
      const stats = await index.describeIndexStats();
      results.stats = stats;
    } catch (error: any) {
      results.stats = { error: error.message };
    }

    res.json({
      success: true,
      message: 'Testing with new API key (full permissions)',
      apiKeyPrefix: process.env.PINECONE_API_KEY?.substring(0, 10) + '...',
      results: results
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to test new API key'
    });
  }
});

// Health check for this specific router
router.get('/health', (req, res) => {
  res.json({
    service: 'Movie Quotes API',
    status: 'healthy',
    endpoints: [
      'POST /api/movie-quotes - Get movie quote recommendations',
      'POST /api/search-by-actor - Search quotes by actor name',
      'POST /api/search-by-movie - Search quotes by movie title',
      'GET /api/cache-stats - Get cache statistics and cost savings',
      'GET /api/test - Test endpoint',
      'GET /api/test-simple - Simple Pinecone test',
      'GET /api/test-new-key - Test with new API key',
      'GET /api/health - Health check'
    ]
  });
});

export default router;