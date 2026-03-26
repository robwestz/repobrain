// =============================================================================
// RepoBrain API Request / Response Types
// =============================================================================

import type {
  RepoStatus,
  Citation,
  IndexProgress,
  MessageRole,
  IndexJobStatus,
  IndexJobType,
  SuggestedChangeStatus,
  BranchActionStatus,
  ComponentInfo,
} from "./domain";

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthCallbackRequest {
  code: string;
  state?: string;
}

export interface AuthCallbackResponse {
  user: UserResponse;
  token: string;
}

export interface AuthSessionResponse {
  user: UserResponse;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserResponse {
  id: string;
  githubLogin: string;
  avatarUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export interface CreateWorkspaceRequest {
  name: string;
}

export interface UpdateWorkspaceRequest {
  name: string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceResponse[];
}

// ---------------------------------------------------------------------------
// Repo Connections
// ---------------------------------------------------------------------------

export interface ConnectRepoRequest {
  githubRepoId: number;
  owner: string;
  name: string;
  defaultBranch?: string;
}

export interface RepoConnectionResponse {
  id: string;
  workspaceId: string;
  githubRepoId: number;
  owner: string;
  name: string;
  defaultBranch: string;
  status: RepoStatus;
  indexedCommitSha: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepoConnectionListResponse {
  repos: RepoConnectionResponse[];
}

export interface RepoStatusResponse {
  status: RepoStatus;
  indexedCommitSha: string | null;
  errorMessage: string | null;
  currentJob: IndexJobResponse | null;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface FileResponse {
  id: string;
  path: string;
  language: string | null;
  sizeBytes: number;
  lineCount: number;
}

export type FileListResponse = PaginatedResponse<FileResponse>;

export interface FileDetailResponse extends FileResponse {
  symbols: SymbolResponse[];
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

export interface SymbolResponse {
  id: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  parentSymbolId: string | null;
  signature: string | null;
}

export interface SymbolRelationResponse {
  id: string;
  fromSymbol: SymbolResponse;
  toSymbol: SymbolResponse;
  relationType: string;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface CreateConversationRequest {
  repoConnectionId: string;
  title?: string;
}

export interface ConversationResponse {
  id: string;
  workspaceId: string;
  repoConnectionId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConversationListResponse = PaginatedResponse<ConversationResponse>;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface SendMessageRequest {
  content: string;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface MessageListResponse {
  messages: MessageResponse[];
}

/** SSE event types for streaming chat responses */
export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "citation"; citation: Citation }
  | { type: "done"; messageId: string }
  | { type: "error"; error: string };

// ---------------------------------------------------------------------------
// Index Jobs
// ---------------------------------------------------------------------------

export interface TriggerIndexRequest {
  jobType?: IndexJobType;
}

export interface IndexJobResponse {
  id: string;
  repoConnectionId: string;
  jobType: IndexJobType;
  status: IndexJobStatus;
  progress: IndexProgress;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface IndexJobListResponse {
  jobs: IndexJobResponse[];
}

// ---------------------------------------------------------------------------
// Repo Summaries
// ---------------------------------------------------------------------------

export interface RepoSummaryResponse {
  id: string;
  repoConnectionId: string;
  summaryText: string;
  componentList: ComponentInfo[];
  generatedAt: string;
  commitSha: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchRequest {
  query: string;
  repoConnectionId: string;
  maxResults?: number;
  fileFilter?: string;
  symbolFilter?: string;
}

export interface SearchResultResponse {
  chunks: RankedChunkResponse[];
  totalFound: number;
  durationMs: number;
}

export interface RankedChunkResponse {
  chunkId: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
  symbolName: string | null;
  language: string | null;
}

// ---------------------------------------------------------------------------
// Phase 3 Stubs — Suggested Changes & Branch Actions
// ---------------------------------------------------------------------------

export interface SuggestedChangeResponse {
  id: string;
  conversationId: string;
  messageId: string;
  filePath: string;
  diffText: string;
  status: SuggestedChangeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptChangeRequest {
  suggestedChangeId: string;
}

export interface CreateBranchRequest {
  repoConnectionId: string;
  branchName: string;
  suggestedChangeIds: string[];
  commitMessage?: string;
}

export interface BranchActionResponse {
  id: string;
  repoConnectionId: string;
  branchName: string;
  sourceBranch: string;
  commitSha: string | null;
  commitMessage: string | null;
  status: BranchActionStatus;
  suggestedChangeIds: string[];
  createdAt: string;
  updatedAt: string;
}
