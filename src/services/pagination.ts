type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null };

// Advance by rows actually received: a project's API cap can be below our page size.
// Never publish a partial dataset when a later page fails.
export async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  try {
    for (let from = 0; ; ) {
      const result = await loadPage(from, from + pageSize - 1);
      if (result.error) return { data: null, error: result.error };
      const page = result.data ?? [];
      if (!page.length && result.count != null && from < result.count) {
        return { data: null, error: new Error("โหลดข้อมูลไม่ครบ กรุณาลองโหลดใหม่") };
      }
      rows.push(...page);
      from += page.length;
      if (!page.length || (result.count != null && from >= result.count)) {
        return { data: rows, error: null };
      }
    }
  } catch (error) {
    return { data: null, error };
  }
}
