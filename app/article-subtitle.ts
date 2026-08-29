type RandomSource = () => number;

const AI_SCIENTIST_QUOTES = [
  { quote: "We can only see a short distance ahead, but we can see plenty there that needs to be done.", author: "Alan Turing" },
  { quote: "It is the science and engineering of making intelligent machines, especially intelligent computer programs.", author: "John McCarthy" },
  { quote: "To build truly intelligent machines, teach them cause and effect.", author: "Judea Pearl" },
  { quote: "I am someone who doesn’t really know what field he’s in but would like to understand how the brain works.", author: "Geoffrey Hinton" },
  { quote: "The creators of AI need to represent humanity.", author: "Fei-Fei Li" },
] as const;

function quoteAt(index: number) {
  const item = AI_SCIENTIST_QUOTES[index];
  return { kind: "quote" as const, text: `“${item.quote}”`, author: item.author };
}

export function resolveArticleSubtitle(summary: string, random: RandomSource = Math.random) {
  if (summary.trim()) return { kind: "summary" as const, text: summary };

  const randomValue = random();
  const normalized = Number.isFinite(randomValue) ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON) : 0;
  return quoteAt(Math.floor(normalized * AI_SCIENTIST_QUOTES.length));
}
