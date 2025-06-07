import { RequestHandler } from 'express';
import { ServerError } from '../types/Types.js';
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

// Pinecone index for movie quotes
const QUOTES_INDEX_NAME = process.env.PINECONE_INDEX || 'quotes';

let quotesIndex: any = null;

// Initialize Pinecone index
if (!process.env.PINECONE_API_KEY) {
  console.error("PINECONE_API_KEY environment variable is required");
} else if (!process.env.PINECONE_INDEX) {
  console.error("PINECONE_INDEX environment variable is required");
} else if (!process.env.PINECONE_HOST) {
  console.error("PINECONE_HOST environment variable is required");
} else {
  try {
    quotesIndex = pinecone.Index(QUOTES_INDEX_NAME, process.env.PINECONE_HOST);
    console.log(`Connected to quotes index: ${QUOTES_INDEX_NAME} at ${process.env.PINECONE_HOST}`);
  } catch (error) {
    console.error("Could not connect to quotes index:", error);
  }
}

// Create embedding for search query
async function createSearchEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.trim(),
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error("Error creating search embedding:", error);
    throw new Error("Failed to create embedding for quote search");
  }
}

// Create enhanced search query from user situation and context
function createSearchQuery(situation: string, situationTypes: string[], mood: string): string {
  const searchTerms = [
    situation,
    ...situationTypes,
    mood,
    'movie quote',
    'conversation'
  ];
  
  return searchTerms.join(' ');
}

// Filter and score quotes based on situation relevance
function scoreQuoteRelevance(quote: any, situationTypes: string[], mood: string): number {
  let score = quote.score || 0; // Base Pinecone similarity score
  
  // Since we only have text, boost score based on text content matching mood/situation
  const text = quote.metadata?.text?.toLowerCase() || '';
  
  // Boost for mood-related words in the quote
  const moodWords = {
    funny: ['idiots', 'stupid', 'fool', 'ridiculous', 'absurd', 'joke'],
    cool: ['back', 'force', 'power', 'ready', 'bring it'],
    dramatic: ['never', 'always', 'forever', 'destiny', 'must', 'cannot'],
    sassy: ['please', 'seriously', 'whatever', 'really', 'excuse me']
  };
  
  const relevantWords = moodWords[mood as keyof typeof moodWords] || [];
  const wordMatches = relevantWords.filter(word => text.includes(word)).length;
  if (wordMatches > 0) {
    score += (wordMatches * 0.05);
  }
  
  // Boost for situation-related words
  const situationWords = {
    comeback: ['not', 'wrong', 'stupid', 'idiots', 'fool'],
    goodbye: ['bye', 'see you', 'farewell', 'leaving', 'go'],
    confident: ['can', 'will', 'ready', 'bring', 'force'],
    rejection: ['no', 'never', 'not interested', 'forget it']
  };
  
  for (const situation of situationTypes) {
    const words = situationWords[situation as keyof typeof situationWords] || [];
    const matches = words.filter(word => text.includes(word)).length;
    if (matches > 0) {
      score += (matches * 0.03);
    }
  }
  
  return Math.min(score, 1.0); // Cap at 1.0
}

// Main quote search controller
export const searchMovieQuotes: RequestHandler = async (req, res, next) => {
  console.log("6. Starting movie quote search");

  // Skip if this was a cache hit
  if (res.locals.skipToEnd) {
    console.log("Skipping quote search - cache hit");
    return next();
  }

  const { naturalLanguageQuery, queryContext } = res.locals;

  if (!naturalLanguageQuery || !queryContext) {
    const error: ServerError = {
      log: 'Quote search missing required data',
      status: 500,
      message: { err: 'Missing search parameters' },
    };
    return next(error);
  }

  if (!quotesIndex) {
    const error: ServerError = {
      log: 'Quotes database not available',
      status: 503,
      message: { err: 'Movie quotes database is currently unavailable. Please try again later.' },
    };
    return next(error);
  }

  try {
    const { situationTypes, mood } = queryContext;
    
    // Create enhanced search query
    const searchQuery = createSearchQuery(naturalLanguageQuery, situationTypes, mood);
    console.log("7. Enhanced search query:", searchQuery);

    // Create embedding for the search
    console.log("8. Creating search embedding");
    const queryEmbedding = await createSearchEmbedding(searchQuery);

    // Search the quotes database in the 'default' namespace
    console.log("9. Searching quotes database in 'default' namespace");
    const searchResults = await quotesIndex.namespace('default').query({
      vector: queryEmbedding,
      topK: 20,
      includeMetadata: true
      // Removed the filter for now to test if that's causing issues
    });

    console.log(`10. Found ${searchResults.matches?.length || 0} potential quotes`);

    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log("No quotes found in database");
      const error: ServerError = {
        log: 'No quotes found for query',
        status: 404,
        message: { err: 'No movie quotes found for your situation. Try describing it differently.' },
      };
      return next(error);
    }

    // Score and filter quotes
    const scoredQuotes = searchResults.matches
      .map(match => ({
        ...match,
        score: scoreQuoteRelevance(match, situationTypes, mood)
      }))
      .filter(quote => quote.score > 0.3) // Filter out low-relevance quotes
      .sort((a, b) => b.score - a.score) // Sort by relevance
      .slice(0, 8); // Take top 8 quotes

    console.log(`11. Selected ${scoredQuotes.length} relevant quotes`);

    // Updated format for Pinecone Movie + Year addition
    const formattedResults = {
      totalFound: scoredQuotes.length,
      quotes: scoredQuotes.map(match => ({
        quote: {
          quote: match.metadata?.text || 'Unknown quote',
          actor: 'Unknown', // Will be filled by AI in ResponseController
          movie: match.metadata?.movie || 'Unknown Movie', 
          year: match.metadata?.year || 0, 
          situations: situationTypes, // Use detected situations
          mood: mood
        },
        score: match.score
      }))
    };

    res.locals.searchResults = formattedResults;
    console.log("12. Quote search completed successfully");
    return next();

  } catch (error: any) {
    console.error("Error searching quotes:", error);
    
    const serverError: ServerError = {
      log: `Quote search failed: ${error.message}`,
      status: 500,
      message: { err: 'Failed to search movie quotes database. Please try again.' },
    };
    return next(serverError);
  }
};