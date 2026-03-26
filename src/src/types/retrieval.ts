// =============================================================================
// RepoBrain Retrieval Types — matching §09 retrieval pipeline
// =============================================================================

// ---------------------------------------------------------------------------
// Retrieval Options
// ---------------------------------------------------------------------------

export interface RetrievalOptions {
  /** The user query to retrieve context for */
  query: string;

  /** UUID of the repo connection to search within */
  repoConnectionId: string;

  /** Maximum number of chunks to return after reranking (default: 20) */
  maxResults?: number;

  /** Number of candidates to fetch from vector search before reranking (default: 100) */
  candidatePoolSize?: number;

  /** Minimum similarity score threshold (0-1) for vector search (default: 0.3) */
  similarityThreshold?: number;

  /** Glob pattern to filter files (e.g., "src/**\/*.ts") */
  fileFilter?: string;

  /** Filter by symbol name or kind */
  symbolFilter?: string;

  /** Whether to expand the query into multiple search queries (default: true) */
  queryExpansion?: boolean;

  /** Whether to include symbol-graph context for retrieved chunks (default: true) */
  includeSymbolContext?: boolean;

  /** Whether to include the repo summary as preamble context (default: true) */
  includeRepoSummary?: boolean;

  /** Maximum total tokens for the assembled context window (default: 12000) */
  maxContextTokens?: number;
}

// ---------------------------------------------------------------------------
// Ranked Chunk
// ---------------------------------------------------------------------------

export interface RankedChunk {
  /** Chunk UUID */
  chunkId: string;

  /** File UUID */
  fileId: string;

  /** Relative file path within the repo */
  filePath: string;

  /** The chunk text content */
  content: string;

  /** 1-based start line in the source file */
  startLine: number;

  /** 1-based end line in the source file */
  endLine: number;

  /** Combined relevance score after reranking (0-1) */
  score: number;

  /** Vector similarity score from embedding search (0-1) */
  vectorScore: number;

  /** Keyword / BM25 score component (0-1) */
  keywordScore: number;

  /** Symbol name if this chunk is associated with a symbol */
  symbolName: string | null;

  /** Symbol kind (function, class, etc.) */
  symbolKind: string | null;

  /** Detected language of the file */
  language: string | null;

  /** Token count of this chunk */
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Retrieval Result
// ---------------------------------------------------------------------------

export interface RetrievalResult {
  /** The ranked and filtered chunks */
  chunks: RankedChunk[];

  /** Total number of candidate chunks found before reranking */
  totalCandidates: number;

  /** The original user query */
  query: string;

  /** Expanded queries used for retrieval (if query expansion was enabled) */
  expandedQueries: string[];

  /** Repo summary text included as preamble (if enabled) */
  repoSummary: string | null;

  /** Total token count of all returned chunks */
  totalTokens: number;

  /** Duration of the retrieval pipeline in milliseconds */
  durationMs: number;

  /** Breakdown of time spent in each pipeline stage */
  timing: RetrievalTiming;
}

// ---------------------------------------------------------------------------
// Retrieval Timing
// ---------------------------------------------------------------------------

export interface RetrievalTiming {
  /** Time spent expanding the query (ms) */
  queryExpansionMs: number;

  /** Time spent on vector similarity search (ms) */
  vectorSearchMs: number;

  /** Time spent on keyword / BM25 search (ms) */
  keywordSearchMs: number;

  /** Time spent merging and reranking results (ms) */
  rerankingMs: number;

  /** Time spent assembling final context (ms) */
  contextAssemblyMs: number;
}

// ---------------------------------------------------------------------------
// Query Expansion Result (internal pipeline type)
// ---------------------------------------------------------------------------

export interface QueryExpansionResult {
  /** The original query */
  originalQuery: string;

  /** Expanded / rephrased queries for broader retrieval */
  expandedQueries: string[];

  /** Hypothetical code snippets the LLM thinks might answer the query */
  hypotheticalSnippets: string[];
}

// ---------------------------------------------------------------------------
// Vector Search Result (internal pipeline type)
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  chunkId: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  similarity: number;
  symbolId: string | null;
  symbolName: string | null;
  symbolKind: string | null;
  language: string | null;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Keyword Search Result (internal pipeline type)
// ---------------------------------------------------------------------------

export interface KeywordSearchResult {
  chunkId: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  bm25Score: number;
  symbolId: string | null;
  symbolName: string | null;
  symbolKind: string | null;
  language: string | null;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Reranking Input (internal pipeline type)
// ---------------------------------------------------------------------------

export interface RerankCandidate {
  chunkId: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  vectorScore: number;
  keywordScore: number;
  symbolName: string | null;
  symbolKind: string | null;
  language: string | null;
  tokenCount: number;
}

// ---------------------------------------------------------------------------
// Context Window (assembled result ready for LLM prompt)
// ---------------------------------------------------------------------------

export interface ContextWindow {
  /** Repo-level summary preamble */
  repoSummary: string | null;

  /** Ordered list of context chunks formatted for the prompt */
  contextChunks: ContextChunk[];

  /** Total token count of the assembled context */
  totalTokens: number;
}

export interface ContextChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  symbolName: string | null;
  language: string | null;
  score: number;
}
