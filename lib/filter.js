/**
 * Word filter with leetspeak normalization, severe slur detection,
 * and boundary-aware profanity filtering (prevents Scunthorpe false positives).
 */

// Severe slurs & hate speech: blocked even if embedded
const SEVERE_SLURS = [
  'nigger', 'nigga', 'faggot', 'chink', 'spic', 'kike', 'retard', 'nazi', 'hitler', 'kys'
];

// General profanities: matched on word boundaries or spaced/punctuated letter patterns
const GENERAL_PROFANITIES = [
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'piss', 'cock', 'dick', 'pussy',
  'asshole', 'bastard', 'rape', 'rapist', 'pedophile', 'pedo', 'kill yourself', 'suicide'
];

const LEET_MAP = {
  '@': 'a', '4': 'a',
  '8': 'b',
  '(': 'c', '<': 'c',
  '3': 'e',
  '9': 'g',
  '#': 'h',
  '!': 'i', '1': 'i', '|': 'i',
  '0': 'o',
  '5': 's', '$': 's',
  '7': 't', '+': 't',
  'v': 'u',
  '%': 'x'
};

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  let normalized = text.toLowerCase();
  
  let replaced = '';
  for (const char of normalized) {
    replaced += LEET_MAP[char] || char;
  }
  
  return replaced;
}

// Collapses repeated characters (e.g., "fuuuuck" -> "fuck")
function collapseRepeats(text) {
  return text.replace(/(.)\1{2,}/g, '$1$1');
}

function containsBlockedWord(text) {
  if (!text || typeof text !== 'string') return false;

  const raw = text.toLowerCase();
  const normalized = normalizeText(raw);
  const collapsed = collapseRepeats(normalized);
  const stripped = normalized.replace(/[^a-z0-9]/g, '');

  // 1. Check severe slurs (even if embedded or stripped)
  for (const slur of SEVERE_SLURS) {
    const slurStripped = slur.replace(/[^a-z0-9]/g, '');
    if (stripped.includes(slurStripped)) {
      return true;
    }
  }

  // 2. Check general profanities with word boundaries or spaced letters
  for (const word of GENERAL_PROFANITIES) {
    // Exact word boundary match on raw, normalized, or collapsed
    const boundaryRegex = new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'i');
    if (boundaryRegex.test(raw) || boundaryRegex.test(normalized) || boundaryRegex.test(collapsed)) {
      return true;
    }

    // Check leetspeak/spaced variations (e.g. "f.u.c.k", "f u c k", "b_i_t_c_h", "f*ck")
    const letterPatterns = word.split('').map(c => `[${c}*._#-]`);
    const spacedPattern = letterPatterns.join('[\\s._*#~-]*');
    const spacedRegex = new RegExp(`(^|[^a-z0-9])${spacedPattern}([^a-z0-9]|$)`, 'i');
    if (spacedRegex.test(raw) || spacedRegex.test(normalized) || spacedRegex.test(collapsed)) {
      return true;
    }

  }

  return false;
}

function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: 'Nickname is required.' };
  }
  const trimmed = nickname.trim();
  if (trimmed.length < 1 || trimmed.length > 12) {
    return { valid: false, error: 'Nickname must be between 1 and 12 characters.' };
  }
  if (containsBlockedWord(trimmed)) {
    return { valid: false, error: 'Try a friendlier nickname 🙂' };
  }
  return { valid: true, nickname: trimmed };
}

function validateCaption(caption) {
  if (!caption || typeof caption !== 'string') {
    return { valid: false, error: 'Caption cannot be empty.' };
  }
  const trimmed = caption.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { valid: false, error: 'Caption must be between 1 and 80 characters.' };
  }
  if (containsBlockedWord(trimmed)) {
    return { valid: false, error: 'Try a friendlier version 🙂' };
  }
  return { valid: true, caption: trimmed };
}

module.exports = {
  normalizeText,
  containsBlockedWord,
  validateNickname,
  validateCaption,
  SEVERE_SLURS,
  GENERAL_PROFANITIES
};
