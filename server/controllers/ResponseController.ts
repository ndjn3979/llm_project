import { RequestHandler } from 'express';
import { ServerError } from '../types/Types.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Create context from found quotes (simplified for text-only)
function createQuoteContext(searchResults: any): string {
  if (!searchResults.quotes || searchResults.quotes.length === 0) {
    return "No specific movie quotes found in database.";
  }

  const contextParts: string[] = ["MATCHING MOVIE QUOTES:"];
  
  searchResults.quotes.forEach((result: any, index: number) => {
    const quote = result.quote;
    contextParts.push(`\n${index + 1}. "${quote.quote}"`);
    contextParts.push(`   - Match score: ${result.score.toFixed(2)}`);
  });

  return contextParts.join('\n');
}

// Updated prompt for text-only quotes
function createMovieQuotePrompt(situation: string, context: string, mood: string): string {
  return `
You are a movie quote expert helping someone find the perfect quote for their situation.

THEIR SITUATION: ${situation}
PREFERRED MOOD: ${mood}

${context}

INSTRUCTIONS:
1. Pick the 1-2 BEST quotes from the provided options that fit their situation
2. For each quote, identify what movie and character it's from (use your knowledge)
3. Explain WHY each quote works perfectly for their situation  
4. Give a quick tip on HOW to deliver it (timing, tone, etc.)
5. Keep it conversational and fun - this is about using quotes in real conversations!

FORMAT:
**Perfect Quote for Your Situation:**
"[Quote]" - [Character] from [Movie] ([Year if you know it])

**Why this works:** [Brief explanation of why it fits]
**How to use it:** [Quick delivery tip]

[If there's a second good option, repeat the format]

Keep it short, practical, and fun! If you don't recognize a quote, just say "from a classic movie" instead of guessing.
  `;
}

// Main controller - generate response and format it (updated for text-only)
export const generateMovieQuoteResponse: RequestHandler = async (_req, res, next) => {
  console.log("9. Generating movie quote response");

  const { naturalLanguageQuery, queryContext, searchResults } = res.locals;

  if (!naturalLanguageQuery || !queryContext || !searchResults) {
    const error: ServerError = {
      log: 'Response generator missing required data',
      status: 500,
      message: { err: 'Error occurred before generating response' },
    };
    return next(error);
  }

  try {
    const { mood } = queryContext;

    // Create context from search results
    const context = createQuoteContext(searchResults);
    console.log("10. Quote context created");

    // Create the prompt
    const prompt = createMovieQuotePrompt(naturalLanguageQuery, context, mood);

    console.log("11. Calling OpenAI for movie quote recommendation");

    // Get AI recommendation
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a fun movie quote expert who helps people find perfect quotes for their conversations. You're great at identifying movies and characters from quotes. Be casual, helpful, and enthusiastic!" 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 500   // Keep responses concise
    });

    const recommendation = completion.choices[0].message.content?.trim() || '';
    console.log("12. AI recommendation generated");

    // Response format (simplified)
    const response = {
      success: true,
      recommendation: recommendation,
      situation: naturalLanguageQuery,
      mood: mood,
      quotesFound: searchResults.totalFound,
      availableQuotes: searchResults.quotes.map((result: any) => ({
        quote: result.quote.quote,
        character: "AI will identify", // Let AI identify in the response
        movie: "AI will identify",
        year: 0,
        score: result.score.toFixed(2)
      })),
      timestamp: new Date().toISOString()
    };

    console.log("13. Response formatted");
    res.locals.finalResponse = response;
    return next();

  } catch (error: any) {
    console.error("Error generating movie quote response:", error);
    const serverError: ServerError = {
      log: `Error generating response: ${error.message}`,
      status: 500,
      message: { err: 'Error generating movie quote recommendation' },
    };
    return next(serverError);
  }
};

// Response sender that handles cache flow
export const sendMovieQuoteResponse: RequestHandler = async (_req, res, next) => {
  console.log("14. Sending movie quote response");

  const { finalResponse, skipToEnd } = res.locals;

  if (!finalResponse) {
    return res.status(500).json({
      success: false,
      error: 'No response generated'
    });
  }

  try {
    // Check if this was a cache hit
    if (skipToEnd) {
      // This was a cache hit, send immediately
      console.log("15. Sending cached response (fast path)");
      return res.status(200).json(finalResponse);
    }

    // Normal response path - send response then continue to cache saving
    res.status(200).json(finalResponse);
    console.log("15. Response sent successfully");
    
    // Continue to cache saving middleware
    return next();
    
  } catch (error) {
    console.error("Error sending response:", error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send response'
    });
  }
};