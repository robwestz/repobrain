// =============================================================================
// RepoBrain Domain Types — Application-level interfaces
// =============================================================================

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

export type RepoStatus = "pending" | "cloning" | "indexing" | "ready" | "failed";

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "constant"
  | "module"
  | "namespace"
  | "property"
  | "constructor"
  | "getter"
  | "setter";

export type SymbolRelationType =
  | "calls"
  | "imports"
  | "extends"
  | "implements"
  | "uses"
  | "overrides"
  | "references";

export type MessageRole = "user" | "assistant" | "system";

export type IndexJobType = "full" | "incremental";

export type IndexJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type SuggestedChangeStatus = "pending" | "accepted" | "rejected" | "applied";

export type BranchActionStatus = "pending" | "created" | "committed" | "failed";

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  githubId: number;
  githubLogin: string;
  githubAccessToken: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepoConnection {
  id: string;
  workspaceId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string;
  indexedCommitSha: string | null;
  status: RepoStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface File {
  id: string;
  repoConnectionId: string;
  path: string;
  language: string | null;
  sizeBytes: number;
  contentHash: string;
  lineCount: number;
  createdAt: Date;
}

export interface Symbol {
  id: string;
  fileId: string;
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  parentSymbolId: string | null;
  signature: string | null;
  createdAt: Date;
}

export interface SymbolRelation {
  id: string;
  fromSymbolId: string;
  toSymbolId: string;
  relationType: SymbolRelationType;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  fileId: string;
  content: string;
  startLine: number;
  endLine: number;
  symbolId: string | null;
  tokenCount: number;
  contentHash: string;
  createdAt: Date;
}

export interface Embedding {
  id: string;
  chunkId: string;
  vector: number[];
  model: string;
  createdAt: Date;
}

export interface RepoSummary {
  id: string;
  repoConnectionId: string;
  summaryText: string;
  componentList: ComponentInfo[];
  generatedAt: Date;
  commitSha: string;
  createdAt: Date;
}

export interface ComponentInfo {
  name: string;
  description: string;
  filePaths: string[];
  dependencies: string[];
}

export interface Conversation {
  id: string;
  workspaceId: string;
  repoConnectionId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  retrievalTrace: RetrievalTrace | null;
  createdAt: Date;
}

export interface IndexJob {
  id: string;
  repoConnectionId: string;
  jobType: IndexJobType;
  status: IndexJobStatus;
  progress: IndexProgress;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Phase 3 Stubs
// ---------------------------------------------------------------------------

export interface SuggestedChange {
  id: string;
  conversationId: string;
  messageId: string;
  filePath: string;
  diffText: string;
  status: SuggestedChangeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchAction {
  id: string;
  repoConnectionId: string;
  branchName: string;
  sourceBranch: string;
  commitSha: string | null;
  commitMessage: string | null;
  status: BranchActionStatus;
  suggestedChangeIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface Citation {
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  symbolName?: string;
}

export interface IndexProgress {
  phase: "cloning" | "parsing" | "chunking" | "embedding" | "summarizing" | "done";
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  processedChunks: number;
  percentage: number;
}

export interface RetrievalTrace {
  query: string;
  expandedQueries: string[];
  chunksRetrieved: number;
  chunksAfterReranking: number;
  totalTokens: number;
  durationMs: number;
}
