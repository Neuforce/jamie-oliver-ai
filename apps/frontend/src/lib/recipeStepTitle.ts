const STEP_TITLE_MAX_LENGTH = 56;
const STEP_PLACEHOLDER_RE = /^step\s+\d+$/i;

function normalizeWhitespace(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateAtWordBoundary(text: string, maxLength = STEP_TITLE_MAX_LENGTH): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLength) {
    return normalized.replace(/[.,;:!?-]+$/, '').trim();
  }

  const sliced = normalized.slice(0, maxLength - 3);
  const boundary = sliced.lastIndexOf(' ');
  const trimmed = (boundary > 20 ? sliced.slice(0, boundary) : sliced)
    .replace(/[.,;:!?-]+$/, '')
    .trim();

  return `${trimmed}...`;
}

function deriveStepTitleFromInstructions(instructions?: string | null): string {
  const normalized = normalizeWhitespace(instructions).replace(/^[\d.\-)\s]+/, '');
  if (!normalized) {
    return '';
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
  const firstClause =
    firstSentence.split(/\s+(?:then|meanwhile|once|when|after|before|while|until)\b/i)[0]
      || firstSentence;

  return truncateAtWordBoundary(firstClause);
}

function isWeakStepTitle(descr?: string | null, instructions?: string | null): boolean {
  const normalizedDescr = normalizeWhitespace(descr);
  if (!normalizedDescr) return true;
  if (normalizedDescr.length <= 2) return true;
  if (STEP_PLACEHOLDER_RE.test(normalizedDescr)) return true;
  if (normalizedDescr.endsWith('...')) return true;

  const normalizedInstructions = normalizeWhitespace(instructions);
  if (!normalizedInstructions) return false;

  return (
    normalizedDescr.length > STEP_TITLE_MAX_LENGTH
    || (
      normalizedDescr.length >= 28
      && normalizedInstructions
        .toLowerCase()
        .startsWith(normalizedDescr.toLowerCase().replace(/\.\.\.$/, ''))
    )
  );
}

export function getStepDisplayTitle(args: {
  descr?: string | null;
  instructions?: string | null;
  stepNumber?: number;
}): string {
  const { descr, instructions, stepNumber } = args;
  if (!isWeakStepTitle(descr, instructions)) {
    return normalizeWhitespace(descr);
  }

  const derived = deriveStepTitleFromInstructions(instructions);
  if (derived) {
    return derived;
  }

  return typeof stepNumber === 'number' ? `Step ${stepNumber}` : 'Step';
}

