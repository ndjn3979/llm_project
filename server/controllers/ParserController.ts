// server/controllers/movieQuoteParserController.ts
import { Request, RequestHandler } from 'express';
import { ServerError } from '../types';

// Conversation types and social situations where movie quotes work well
function detectSituationType(query: string): string[] {
  const situationPatterns = {
    'comeback': /\b(comeback|witty response|roast|burn|insult|clever reply)\b/i,
    'goodbye': /\b(leaving|goodbye|farewell|see you later|departing|exit)\b/i,
    'greeting': /\b(hello|hi|meeting|introduction|first time|new person)\b/i,
    'rejection': /\b(reject|turn down|not interested|no thanks|decline)\b/i,
    'awkward': /\b(awkward|uncomfortable|weird|strange|embarrassing|cringe)\b/i,
    'confident': /\b(confident|boss|badass|cool|swagger|attitude)\b/i,
    'romantic': /\b(flirting|date|romantic|love|asking out|valentine)\b/i,
    'work': /\b(work|office|boss|meeting|colleague|professional)\b/i,
    'party': /\b(party|celebration|drinks|social|friends|gathering)\b/i,
    'argument': /\b(argument|fight|disagreement|debate|confrontation)\b/i
  };

  const detectedSituations: string[] = [];
  for (const [situation, pattern] of Object.entries(situationPatterns)) {
    if (pattern.test(query)) {
      detectedSituations.push(situation);
    }
  }
  return detectedSituations;
}

// Key moods that determine quote style
function detectMood(query: string): 'funny' | 'cool' | 'dramatic' | 'sassy' {
  if (/\b(funny|hilarious|joke|laugh|comedy|humor)\b/i.test(query)) return 'funny';
  if (/\b(cool|badass|smooth|suave|confident)\b/i.test(query)) return 'cool';
  if (/\b(dramatic|serious|intense|powerful|epic)\b/i.test(query)) return 'dramatic';
  if (/\b(sassy|sarcastic|witty|clever|smart)\b/i.test(query)) return 'sassy';
  return 'funny'; // Default to funny since most conversational quotes are humorous
}

// Parse situation and mood
export const parseMovieQuoteRequest: RequestHandler = async (
  req: Request<unknown, unknown, Record<string, unknown>>,
  res,
  next
) => {
  console.log("1. Movie quote request parsing started");

  if (!req.body.naturalLanguageQuery) {
    const error: ServerError = {
      log: 'Movie quote situation not provided',
      status: 400,
      message: { err: 'Please describe the situation where you need a movie quote' },
    };
    return next(error);
  }

  const { naturalLanguageQuery } = req.body;

  if (typeof naturalLanguageQuery !== 'string') {
    const error: ServerError = {
      log: 'Movie quote request is not a string',
      status: 400,
      message: { err: 'Situation description must be text' },
    };
    return next(error);
  }

  try {
    const cleanedQuery = naturalLanguageQuery.trim();
    console.log("2. Cleaned situation:", cleanedQuery);

    // Detect what kind of situation they're in
    const situationTypes = detectSituationType(cleanedQuery);
    console.log("3. Detected situations:", situationTypes);

    // Detect the mood/tone they want
    const mood = detectMood(cleanedQuery);
    console.log("4. Detected mood:", mood);

    // Context object
    res.locals.naturalLanguageQuery = cleanedQuery;
    res.locals.queryContext = {
      situationTypes,
      mood,
      originalQuery: naturalLanguageQuery
    };

    console.log("5. Context ready for movie quote search");
    return next();

  } catch (error: any) {
    const serverError: ServerError = {
      log: `Error parsing movie quote request: ${error.message}`,
      status: 500,
      message: { err: 'Error analyzing your situation' },
    };
    return next(serverError);
  }
};