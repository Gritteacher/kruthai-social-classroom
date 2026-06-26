declare module "@supabase/supabase-js" {
  export interface SupabaseError { message: string; }
  export interface SupabaseUser { id?: string; email?: string; user_metadata?: Record<string, unknown>; }
  export interface AuthSession { access_token?: string; user?: SupabaseUser | null; }
  export interface AuthResult { data: { user?: SupabaseUser | null }; error: SupabaseError | null; }
  export interface SessionResult { data: { session?: AuthSession | null }; error: SupabaseError | null; }
  export interface MutationResult { data?: unknown; error: SupabaseError | null; }
  export interface QueryBuilder { insert(payload: unknown): Promise<MutationResult>; upsert(payload: unknown, options?: Record<string, unknown>): Promise<MutationResult>; }
  export interface SignedUrlResult { data?: { signedUrl?: string } | null; error: SupabaseError | null; }
  export interface StorageBucket { upload(path: string, file: File): Promise<MutationResult>; createSignedUrl(path: string, expiresIn: number): Promise<SignedUrlResult>; }
  export interface SupabaseClient { auth: { signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>; getSession(): Promise<SessionResult>; resetPasswordForEmail(email: string, options?: Record<string, unknown>): Promise<MutationResult>; signOut(): Promise<MutationResult>; updateUser(attributes: Record<string, unknown>): Promise<MutationResult>; }; from(table: string): QueryBuilder; storage: { from(bucket: string): StorageBucket; }; }
  export function createClient(url: string, key: string, options?: Record<string, unknown>): SupabaseClient;
}
