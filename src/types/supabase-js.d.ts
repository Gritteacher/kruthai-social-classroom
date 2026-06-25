declare module "@supabase/supabase-js" {
  export interface SupabaseError { message: string; }
  export interface SupabaseUser { user_metadata?: Record<string, unknown>; }
  export interface AuthResult { data: { user?: SupabaseUser | null }; error: SupabaseError | null; }
  export interface MutationResult { data?: unknown; error: SupabaseError | null; }
  export interface QueryBuilder { insert(payload: unknown): Promise<MutationResult>; upsert(payload: unknown, options?: Record<string, unknown>): Promise<MutationResult>; }
  export interface StorageBucket { upload(path: string, file: File): Promise<MutationResult>; }
  export interface SupabaseClient { auth: { signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>; signOut(): Promise<MutationResult>; }; from(table: string): QueryBuilder; storage: { from(bucket: string): StorageBucket; }; }
  export function createClient(url: string, key: string, options?: Record<string, unknown>): SupabaseClient;
}
