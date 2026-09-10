/**
 * Domain 3: Step 2 — Company Brief Synthesizer
 * Ingests crawled pages from Domain 2, enforces Top-K link-ranker page selection
 * within a 16,000 character context cap, and provides honest fallback when pages are unretrievable.
 */
import { CompanyBrief, CompanyBriefSchema } from '@taro/shared';
import { CompanyResearchResult } from '../crawler/types';
import { getDefaultLlmClient } from '../llm/client';
import { wrapUntrustedContext, PROMPT_INJECTION_INSTRUCTION } from '../llm/prompt-guard';
import { parseAndValidateJson } from '../llm/json-parser';
import { PipelineOptions, Step2BriefResult } from './types';
import { z } from 'zod';

const RawBriefSchema = z.object({
  summary: z.string().min(1),
  what_they_do: z.string().min(1),
  sources: z.array(z.string()).default([]),
});

const STEP2_SYSTEM_PROMPT = `You are a corporate intelligence analyst for an interview preparation kit.
${PROMPT_INJECTION_INSTRUCTION}

Your task:
Analyze the provided company webpage excerpts and discussion notes to synthesize a grounded, accurate company brief:
1. "summary": A concise overview (2-4 sentences) of what the company does, their primary market, and their core product/business model.
2. "what_they_do": A direct, plain-language description of their primary products, engineering systems, and customer base.
3. "sources": An array of verified URL strings from which this intelligence was drawn.

CRITICAL RELEVANCE RULES:
- DISCARD STOREFRONT & COMMERCIAL NOISE: If crawled pages contain consumer product catalogs, shopping deals, promotional discounts, or retail sales (e.g. pots, makeup, bags), COMPLETELY DISCARD them. Focus strictly on corporate identity, technology domains, engineering scale, and business model.
- HONEST DEGRADATION RULES:
- If the crawled text indicates the site was unreachable, blocked, or minimal, state that honestly. DO NOT fabricate products, revenue, or details not present in the text.
- Respond ONLY with a valid JSON object matching:
{
  "summary": "string",
  "what_they_do": "string",
  "sources": ["https://..."]
}`;

/**
 * Budgets crawled content within a hard 16,000 character (~4,000 token) context window.
 * Prioritizes high-signal careers, hiring, leadership principles, and engineering pages over consumer storefronts.
 */
function buildBoundedContext(research: CompanyResearchResult): { contextText: string; pagesUsed: string[] } {
  const rawPages = research.pages || [];
  if (rawPages.length === 0) {
    return { contextText: 'No pages retrieved from crawl.', pagesUsed: [] };
  }

  // Prioritize dedicated careers, hiring, leadership principles, and engineering pages over storefront catalogs
  const sortedPages = [...rawPages].sort((a, b) => {
    const aUrl = a.url.toLowerCase();
    const bUrl = b.url.toLowerCase();
    const aIsPriority = /(careers|jobs|how-we-hire|leadership|principles|engineering|culture|about)/i.test(aUrl);
    const bIsPriority = /(careers|jobs|how-we-hire|leadership|principles|engineering|culture|about)/i.test(bUrl);
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    return 0;
  });

  const pagesUsed: string[] = [];
  let contextSnippet = '';
  let budgetRemaining = 12000;

  for (const page of sortedPages) {
    if (budgetRemaining <= 400) break;
    pagesUsed.push(page.url);

    const pageText = (page as any).cleanText || (page as any).cleanedText || '';
    const alloc = Math.min(budgetRemaining, 4000);
    const slice = pageText.length > alloc ? pageText.slice(0, alloc) + '\n[...truncated for context window...]' : pageText;

    const pageLabel = page.url === research.rootUrl ? 'ROOT HOMEPAGE' : 'DISCOVERED INTELLIGENCE PAGE';
    contextSnippet += `=== ${pageLabel} (${page.url}) ===\n${slice}\n\n`;
    budgetRemaining -= slice.length;
  }

  // Discussion notes allocation (up to 4,000 chars)
  let discussionSnippet = '';
  if (research.discussionNotes) {
    const dText = research.discussionNotes;
    discussionSnippet = `=== PUBLIC DISCUSSION & INTERVIEW PROCESS NOTES ===\n${
      dText.length > 4000 ? dText.slice(0, 4000) + '\n[...truncated...]' : dText
    }\n\n`;
  }

  const combined = `${contextSnippet}${discussionSnippet}`.trim();
  return { contextText: combined, pagesUsed };
}

export async function synthesizeCompanyBrief(
  companyUrl: string,
  research: CompanyResearchResult,
  options: PipelineOptions = {}
): Promise<Step2BriefResult> {
  if (options.onProgress) {
    options.onProgress({
      step: 'brief',
      percent: 30,
      message: 'Synthesizing company intelligence and verifying public sources...',
    });
  }

  const pages = research.pages || [];

  // Honest Fallback if site was completely unreachable
  if (pages.length === 0) {
    const brief: CompanyBrief = {
      summary: 'Company website could not be retrieved from public sources.',
      what_they_do: 'Unknown from public web crawl.',
      sources: [],
    };
    CompanyBriefSchema.parse(brief);
    return { brief, pagesUsed: [] };
  }

  const { contextText, pagesUsed } = buildBoundedContext(research);

  const client = options.client || getDefaultLlmClient({ mock: options.mock });
  const prompt = `${wrapUntrustedContext(contextText)}\n\nCompany URL: ${companyUrl}\n\nSynthesize the company brief based strictly on the context above. Return JSON.`;

  const response = await client.complete(prompt, {
    systemPrompt: STEP2_SYSTEM_PROMPT,
    jsonMode: true,
    temperature: 0.2,
  });

  const rawParsed = parseAndValidateJson(response.content, RawBriefSchema, 'Step 2 (Brief)');

  const brief: CompanyBrief = {
    summary: rawParsed.summary.trim(),
    what_they_do: rawParsed.what_they_do.trim(),
    sources: rawParsed.sources && rawParsed.sources.length > 0 ? rawParsed.sources : pagesUsed,
  };

  // Assert Appendix A schema conformance
  CompanyBriefSchema.parse(brief);

  return {
    brief,
    pagesUsed,
  };
}
