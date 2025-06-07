import { RequestHandler } from 'express';
import { ServerError } from '../types/Types.js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
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
5. Keep it conversational, practical, and fun - this is about using quotes in real conversations!

FORMAT:
**Perfect Quote for Your Situation:**
"[Quote]" - [Actor] from [Movie] ([Year if you know it])

**Why this works:** [Brief explanation of why it fits]
**How to use it:** [Quick delivery tip]

[If there's a second good option, repeat the format]
If you don't recognize a quote, just say "from a classic movie" instead of guessing.
  `;
}

// Situational search controller - Generate response and format it
export const generateMovieQuoteResponse: RequestHandler = async (_req, res, next) => {
  console.log("9. Generating movie quote response");

  // Skip if this was a cache hit
  if (res.locals.skipToEnd) {
    console.log("Skipping response generation - cache hit");
    return next();
  }

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
          content: "You are a fun movie quote expert who helps people find perfect quotes for their conversations. You're great at identifying movies and actors from quotes. Be casual, helpful, and enthusiastic!" 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 500   // Keep responses concise
    });

    const recommendation = completion.choices[0].message.content?.trim() || '';
    console.log("12. AI recommendation generated");

    // Quote processing to identify actors
    console.log("13. Identifying actors for quotes");
    let enhancedQuotes = searchResults.quotes.map((result: any) => ({
      quote: result.quote.quote,
      actor: "Unknown actor", // Will be enhanced below
      movie: result.quote.movie || "Unknown movie", // Use Pinecone movie data
      year: result.quote.year || 0,
      score: result.score.toFixed(2)
    }));

    // Get actor information for the quotes
    if (enhancedQuotes.length > 0) {
      try {
        const actorPrompt = `For each of these movie quotes, identify the actor who said them:
        ${enhancedQuotes.map((q, i) => `${i+1}. "${q.quote}" from ${q.movie}`).join('\n')}

          Respond with a JSON array like this:
          [
            {
              "quote": "exact quote text",
              "actor": "actor name",
              "movie": "movie title"
            }
          ]

          Only include the actor name, don't add character information.`;

        const actorCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a movie expert who can identify actors from their quotes. Provide accurate actor information." },
            { role: "user", content: actorPrompt }
          ],
          temperature: 0.3,
          max_tokens: 800
        });

        const actorResponseText = actorCompletion.choices[0].message.content?.trim() || '';
        
        // Try to parse the JSON response
        try {
          const jsonMatch = actorResponseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const actorData = JSON.parse(jsonMatch[0]);
            
            // Match quotes with actor data
            enhancedQuotes = enhancedQuotes.map((quote, index) => {
              const matchingActor = actorData.find((a: any) => 
                a.quote && quote.quote.includes(a.quote.substring(0, 20))
              ) || actorData[index];
              
              return {
                ...quote,
                actor: matchingActor?.actor || quote.actor
              };
            });
            
            console.log("14. Actor identification completed");
          }
        } catch (parseError) {
          console.log("14. Actor identification failed, using original data");
        }
      } catch (actorError) {
        console.log("14. Actor identification request failed, using original data");
      }
    }

    // Response format
    const response = {
      success: true,
      recommendation: recommendation,
      situation: naturalLanguageQuery,
      mood: mood,
      quotesFound: searchResults.totalFound,
      availableQuotes: enhancedQuotes,
      timestamp: new Date().toISOString()
    };

    console.log("15. Response formatted with actor information");
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

// Actor search controller using web search instead of Pinecone
export const searchByActor: RequestHandler = async (req, res, next) => {
  console.log("1. Actor search request started");
  
  try {
    const { actorName } = req.body;
    console.log("2. Processing actor search for:", actorName);
    
    if (!actorName || typeof actorName !== 'string') {
      console.log("❌ Actor search failed: Invalid actor name provided");
      const error: ServerError = {
        log: 'Invalid actor name provided',
        status: 400,
        message: { err: 'Actor name is required' },
      };
      return next(error);
    }

    console.log("3. Searching internet for famous quotes by actor");
    
    // Use OpenAI to search for famous quotes by this actor
    const prompt = `Find 8-10 famous movie quotes by actor "${actorName}". For each quote, provide:
1. The exact quote
2. The character name who said it
3. The movie title
4. The year (if known)

Format your response as a JSON array like this:
[
  {
    "quote": "Exact quote text",
    "character": "Character name",
    "movie": "Movie title",
    "year": 1999
  }
]

However, do not say "JSON array" in the frontend response.

Only include real, famous quotes that are actually from movies starring ${actorName}. Be accurate about the movies and quotes.`;

    console.log("4. Calling OpenAI to find actor quotes");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are a movie expert with extensive knowledge of famous movie quotes and actors. Provide accurate information about real movie quotes." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    console.log("5. Parsing OpenAI response");
    const responseText = completion.choices[0].message.content?.trim() || '';
    
    // Try to parse JSON response
    let quotes: any[] = [];
    try {
      // Extract JSON from response if it's wrapped in text
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        quotes = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.log("6. JSON parsing failed, using fallback parsing");
      // Fallback: create a simple response
      quotes = [{
        quote: "Unable to parse structured quotes",
        character: "Unknown",
        movie: "Unknown",
        year: 0
      }];
    }

    console.log(`6. Found ${quotes.length} quotes for actor`);

    // Format quotes to match expected structure
    const formattedQuotes = quotes.map((quote, index) => ({
      quote: quote.quote || 'Unknown quote',
      character: quote.character || 'Unknown character',
      movie: quote.movie || 'Unknown movie',
      year: quote.year || 0,
      score: 'N/A' // No score for internet searches
    }));

    // Store results for response generation
    res.locals.actorSearchResults = {
      actorName,
      quotes: formattedQuotes,
      totalFound: formattedQuotes.length,
      searchMethod: 'internet' // Flag to indicate this was an internet search
    };

    console.log("7. Actor internet search completed, proceeding to response generation");
    return next();

  } catch (error: any) {
    console.error('❌ Actor search error:', error.message);
    const serverError: ServerError = {
      log: `Actor search failed: ${error.message}`,
      status: 500,
      message: { err: 'Failed to search quotes by actor' },
    };
    return next(serverError);
  }
};

/* Actor search controller (if 'actor' gets added to Pinecone)
export const searchByActor: RequestHandler = async (req, res, next) => {
  console.log("1. Actor search request started");
  
  try {
    const { actorName } = req.body;
    console.log("2. Processing actor search for:", actorName);
    
    if (!actorName || typeof actorName !== 'string') {
      console.log("❌ Actor search failed: Invalid actor name provided");
      const error: ServerError = {
        log: 'Invalid actor name provided',
        status: 400,
        message: { err: 'Actor name is required' },
      };
      return next(error);
    }

    console.log("3. Connecting to Pinecone index");
    const index = pinecone.Index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST!);
    
    console.log("4. Creating embedding for actor search query");
    const searchQuery = `actor ${actorName} movie quotes`;
    console.log("   Enhanced search query:", searchQuery);
    
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: searchQuery,
    });
    
    console.log("5. Searching Pinecone database for actor quotes");
    const searchResults = await index.namespace('default').query({
      vector: embedding.data[0].embedding,
      topK: 20,
      includeMetadata: true,
      filter: {
        actor: { "$eq": actorName }  // Only return quotes where movie field equals the search term
      }
    });

    console.log(`6. Found ${searchResults.matches?.length || 0} potential quotes for actor`);

    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log("❌ No quotes found for actor:", actorName);
      const error: ServerError = {
        log: `No quotes found for actor: ${actorName}`,
        status: 404,
        message: { err: `No quotes found for actor "${actorName}"` },
      };
      return next(error);
    }

    console.log("7. Processing and formatting quote results");
    const quotes = searchResults.matches.map((match, index) => {
      console.log(`   Quote ${index + 1}: "${(match.metadata?.text || 'Unknown quote').substring(0, 50)}..." (score: ${(match.score || 0).toFixed(2)})`);
      return {
        quote: match.metadata?.text || 'Unknown quote',
        actor: 'Unknown',
        movie: 'Unknown Movie',
        year: 0,
        score: (match.score || 0).toFixed(2)
      };
    });

    // Store results for response generation
    res.locals.actorSearchResults = {
      actorName,
      quotes,
      totalFound: quotes.length
    };

    console.log("8. Actor search completed, proceeding to response generation");
    return next();

  } catch (error: any) {
    console.error('❌ Actor search error:', error.message);
    const serverError: ServerError = {
      log: `Actor search failed: ${error.message}`,
      status: 500,
      message: { err: 'Failed to search quotes by actor' },
    };
    return next(serverError);
  }
};
*/

// Movie search controller
export const searchByMovie: RequestHandler = async (req, res, next) => {
  console.log("1. Movie search request started");
  
  try {
    const { movieTitle } = req.body;
    console.log("2. Processing movie search for:", movieTitle);
    
    if (!movieTitle || typeof movieTitle !== 'string') {
      console.log("❌ Movie search failed: Invalid movie title provided");
      const error: ServerError = {
        log: 'Invalid movie title provided',
        status: 400,
        message: { err: 'Movie title is required' },
      };
      return next(error);
    }

    console.log("3. Connecting to Pinecone index");
    const index = pinecone.Index(process.env.PINECONE_INDEX!, process.env.PINECONE_HOST!);
    
    console.log("4. Creating embedding for movie search query");
    console.log("   Search query:", movieTitle);
    
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: movieTitle,
    });
    
    console.log("5. Searching Pinecone database for movie quotes");
    const searchResults = await index.namespace('default').query({
      vector: embedding.data[0].embedding,
      topK: 20,
      includeMetadata: true,
      filter: {
        movie: { "$eq": movieTitle }  // Only return quotes where movie field equals the search term
      }
    });

    console.log(`6. Found ${searchResults.matches?.length || 0} quotes for movie in Pinecone`);

    if (!searchResults.matches || searchResults.matches.length === 0) {
      console.log("❌ No quotes found for movie:", movieTitle);
      // Store no-results response for later sending
      res.locals.movieNoResults = {
        movieTitle,
        message: `I couldn't find any quotes specifically from "${movieTitle}" in our database. This could be because:\n\n• The movie isn't in our quote collection\n• The movie title might be spelled differently\n• Try searching for a more popular or well-known movie\n\nSome popular movies in our database include classic films with memorable quotes. Try searching for movies like "The Godfather," "Star Wars," or "Casablanca."`
      };
      return next();
    }

    console.log("7. Processing and formatting movie quote results");
    const quotes = searchResults.matches.map((match, index) => {
      console.log(`   Quote ${index + 1}: "${(match.metadata?.text || 'Unknown quote').substring(0, 50)}..." (score: ${(match.score || 0).toFixed(2)})`);
      return {
        quote: match.metadata?.text || 'Unknown quote',
        actor: 'Actor',
        movie: match.metadata?.movie || 'Unknown Movie', 
        year: match.metadata?.year || 'Unknown',
        score: (match.score || 0).toFixed(2)
      };
    });

    // Store results for response generation
    res.locals.movieSearchResults = {
      movieTitle,
      quotes,
      totalFound: quotes.length
    };

    console.log("8. Movie search completed, proceeding to response generation");
    return next();

  } catch (error: any) {
    console.error('❌ Movie search error:', error.message);
    const serverError: ServerError = {
      log: `Movie search failed: ${error.message}`,
      status: 500,
      message: { err: 'Failed to search quotes by movie' },
    };
    return next(serverError);
  }
};

// Generate actor search response (updated for internet search)
export const generateActorResponse: RequestHandler = async (_req, res, next) => {
  console.log("8. Generating response for actor quotes");

  const { actorSearchResults } = res.locals;

  if (!actorSearchResults) {
    const error: ServerError = {
      log: 'Actor search results missing',
      status: 500,
      message: { err: 'Error occurred before generating actor response' },
    };
    return next(error);
  }

  try {
    const { actorName, quotes, searchMethod } = actorSearchResults;

    let recommendation;
    
    if (searchMethod === 'internet') {
      // For internet searches, create a nice summary
      console.log("9. Creating summary of internet search results");
      
      const validQuotes = quotes.filter(q => q.quote !== 'Unknown quote');
      
      if (validQuotes.length === 0) {
        recommendation = `I searched for famous movie quotes by "${actorName}" but couldn't find reliable quote information. This could be because:

- The actor name might be spelled differently
- They might not be known for particularly quotable movie lines
- Try searching for a more well-known actor

Some actors famous for memorable quotes include Tom Hanks, Arnold Schwarzenegger, or Morgan Freeman.`;
      } else {
        recommendation = `Here are some famous movie quotes by **${actorName}**:\n\n`;
        
        validQuotes.slice(0, 5).forEach((quote, index) => {
          recommendation += `**${index + 1}. "${quote.quote}"**\n`;
          recommendation += `*${quote.character} in ${quote.movie}*`;
          if (quote.year && quote.year > 0) {
            recommendation += ` (${quote.year})`;
          }
          recommendation += '\n\n';
        });
        
        recommendation += `These are some of ${actorName}'s most memorable movie lines. Each quote showcases their range and the iconic characters they've portrayed on screen.`;
      }
    } else {
      // Fallback for any other search method
      recommendation = `Found ${quotes.length} quotes attributed to ${actorName}.`;
    }

    console.log("10. Actor response generated");

    const response = {
      success: true,
      recommendation: recommendation,
      quotesFound: quotes.length,
      availableQuotes: quotes.map(quote => ({
        quote: quote.quote,
        character: quote.character,
        movie: quote.movie,
        year: quote.year,
        score: quote.score,
        actor: actorName
      })),
      timestamp: new Date().toISOString()
    };

    res.locals.finalResponse = response;
    console.log("11. Actor response formatted");
    return next();

  } catch (error: any) {
    console.error("Error generating actor response:", error);
    const serverError: ServerError = {
      log: `Error generating actor response: ${error.message}`,
      status: 500,
      message: { err: 'Error generating actor quote response' },
    };
    return next(serverError);
  }
};

/* Generate actor search response (Pinecone version)
export const generateActorResponse: RequestHandler = async (_req, res, next) => {
  console.log("9. Generating AI response to identify and verify actor quotes");

  const { actorSearchResults } = res.locals;

  if (!actorSearchResults) {
    const error: ServerError = {
      log: 'Actor search results missing',
      status: 500,
      message: { err: 'Error occurred before generating actor response' },
    };
    return next(error);
  }

  try {
    const { actorName, quotes } = actorSearchResults;

    const prompt = `You found these movie quotes potentially by actor "${actorName}". For each quote, identify if it's actually by ${actorName} and from which movie/character. Format nicely and only include quotes that are actually by this actor.`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a movie expert who can identify actors and their quotes." },
        { role: "user", content: `${prompt}\n\nQuotes: ${quotes.map((q: any) => q.quote).join('\n')}` }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    console.log("10. AI analysis completed");
    const recommendation = completion.choices[0].message.content?.trim() || '';
    console.log("    Generated recommendation length:", recommendation.length, "characters");

    const response = {
      success: true,
      recommendation: recommendation,
      quotesFound: quotes.length,
      availableQuotes: quotes,
      timestamp: new Date().toISOString()
    };

    res.locals.finalResponse = response;
    console.log("11. Actor response formatted");
    return next();

  } catch (error: any) {
    console.error("Error generating actor response:", error);
    const serverError: ServerError = {
      log: `Error generating actor response: ${error.message}`,
      status: 500,
      message: { err: 'Error generating actor quote response' },
    };
    return next(serverError);
  }
};
*/

// Generate movie search response (AI assistance for Actor search)
export const generateMovieResponse: RequestHandler = async (_req, res, next) => {
  console.log("9. Generating AI response to identify actors for movie quotes");

  const { movieSearchResults, movieNoResults } = res.locals;

  // Handle no results case
  if (movieNoResults) {
    console.log("10. Sending no-results response for movie search");
    const response = {
      success: true,
      recommendation: movieNoResults.message,
      quotesFound: 0,
      availableQuotes: [],
      timestamp: new Date().toISOString()
    };
    res.locals.finalResponse = response;
    return next();
  }

  if (!movieSearchResults) {
    const error: ServerError = {
      log: 'Movie search results missing',
      status: 500,
      message: { err: 'Error occurred before generating movie response' },
    };
    return next(error);
  }

  try {
    const { movieTitle, quotes } = movieSearchResults;

    // Simplified prompt focused on actor identification and clean presentation
    const prompt = `Here are quotes from the movie "${movieTitle}". For each quote, provide the character name and actor who said it.

Quotes:
${quotes.map((q: any, i: number) => `${i+1}. "${q.quote}"`).join('\n')}

Format your response like this:
Here are famous quotes from **${movieTitle}**:

**1. "${quotes[0]?.quote}"**
*Character Name in ${movieTitle}* (Year)
Actor: Actor Name

[Continue for each quote]
`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a movie expert. Provide clean, formatted information about movie quotes without excessive verification language. Be direct and informative." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1200
    });

    console.log("10. AI actor identification completed");
    const responseText = completion.choices[0].message.content?.trim() || '';
    
    // Try to extract JSON and enhance quotes with actor information
    let enhancedQuotes = quotes; // fallback to original quotes
    try {
      console.log("11. Parsing enhanced quote data with actor information");
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiQuotes = JSON.parse(jsonMatch[0]);
        enhancedQuotes = aiQuotes.map((aiQuote: any, index: number) => ({
          quote: aiQuote.quote || quotes[index]?.quote || 'Unknown quote',
          character: aiQuote.character || 'Unknown character',
          movie: movieTitle,
          year: aiQuote.year || quotes[index]?.year || 0,
          score: originalQuote?.score || '0.00', // Use Pinecone score
          actor: aiQuote.actor || 'Unknown actor'
        }));
        
        console.log(`    Enhanced ${enhancedQuotes.length} quotes with actor information`);
      }
    } catch (parseError) {
      console.log("    Failed to parse enhanced quote data, using original quotes");
      // Enhance original quotes with fallback actor info
      enhancedQuotes = quotes.map((quote: any) => ({
        ...quote,
        actor: 'Unknown actor'
      }));
    }

    // Extract just the text part (before JSON) for the recommendation
    const recommendationText = responseText.replace(/\[[\s\S]*\]/, '').trim();
    
    console.log("    Generated recommendation length:", recommendationText.length, "characters");

    const response = {
      success: true,
      recommendation: recommendationText,
      quotesFound: enhancedQuotes.length,
      availableQuotes: enhancedQuotes,
      timestamp: new Date().toISOString()
    };

    res.locals.finalResponse = response;
    console.log("12. Movie response formatted with actor information");
    return next();

  } catch (error: any) {
    console.error("Error generating movie response:", error);
    const serverError: ServerError = {
      log: `Error generating movie response: ${error.message}`,
      status: 500,
      message: { err: 'Error generating movie quote response' },
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

// Unified response sender for actor/movie searches
export const sendResponse: RequestHandler = async (_req, res) => {
  console.log("12. Sending response");

  const { finalResponse } = res.locals;

  if (!finalResponse) {
    console.log("❌ No response to send");
    return res.status(500).json({
      success: false,
      error: 'No response generated'
    });
  }

  try {
    res.status(200).json(finalResponse);
    console.log("✅ Response sent successfully");
  } catch (error) {
    console.error("❌ Error sending response:", error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send response'
    });
  }
};