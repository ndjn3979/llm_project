import { RequestHandler } from 'express';
import { ServerError } from '../types';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Create context from found quotes
function createQuoteContext(searchResults: any): string {
  if (!searchResults.quotes || searchResults.quotes.length === 0) {
    return "No specific movie quotes found in database.";
  }

  const contextParts: string[] = ["MATCHING MOVIE QUOTES:"];
  
  searchResults.quotes.forEach((result: any, index: number) => {
    const quote = result.quote;
    contextParts.push(`\n${index + 1}. "${quote.quote}"`);
    contextParts.push(`   - ${quote.character} from ${quote.movie} (${quote.year})`);
    contextParts.push(`   - Best for: ${quote.situations.join(', ')}`);
    contextParts.push(`   - Mood: ${quote.mood}`);
  });

  return contextParts.join('\n');
}

// Prompt for movie quote recommendations
function createMovieQuotePrompt(situation: string, context: string, mood: string): string {
  return `
You are a movie quote expert helping someone find the perfect quote for their situation.

THEIR SITUATION: ${situation}
PREFERRED MOOD: ${mood}

${context}

INSTRUCTIONS:
1. Pick the 1-3 BEST quotes from the provided options that fit their situation
2. Explain WHY each quote works perfectly for their situation  
3. Give a quick tip on HOW to deliver it (timing, tone, etc.)
4. Keep it conversational and fun - this is about using quotes in real conversations!

FORMAT:
**Perfect Quote for Your Situation:**
"[Quote]" - [Character] from [Movie]

**Why this works:** [Brief explanation of why it fits]
**How to use it:** [Quick delivery tip]

[If there are more good options, repeat the format]

Keep it short, practical, and fun!`;
}

// Generate response and format it
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
          content: "You are a fun movie quote expert who helps people find perfect quotes for their conversations. Be casual, helpful, and enthusiastic!" 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.6, // Slightly creative but not too wild
      max_tokens: 500   // Keep responses concise
    });

    const recommendation = completion.choices[0].message.content?.trim() || '';
    console.log("12. AI recommendation generated");

    // Response format
    const response = {
      success: true,
      recommendation: recommendation,
      situation: naturalLanguageQuery,
      mood: mood,
      quotesFound: searchResults.totalFound,
      availableQuotes: searchResults.quotes.map((result: any) => ({
        quote: result.quote.quote,
        character: result.quote.character,
        movie: result.quote.movie,
        year: result.quote.year,
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

// Response sender
export const sendMovieQuoteResponse: RequestHandler = async (_req, res, _next) => {
  console.log("14. Sending movie quote response");

  const { finalResponse } = res.locals;

  if (!finalResponse) {
    return res.status(500).json({
      success: false,
      error: 'No response generated'
    });
  }

  try {
    res.status(200).json(finalResponse);
    console.log("15. Response sent successfully");
  } catch (error) {
    console.error("Error sending response:", error);
    res.status(500).json({
      success: false,
      error: 'Failed to send response'
    });
  }
};