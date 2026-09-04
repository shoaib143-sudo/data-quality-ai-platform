import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type DocumentSearchParams = Promise<{
  document?: string
  chunk?: string
}>

function value(value: unknown) {
  return value === null || value === undefined || value === '' ? 'N/A' : String(value)
}

export default async function DocumentsPage({ searchParams }: { searchParams: DocumentSearchParams }) {
  await requireUser()
  const requested = await searchParams
  const supabase = await createClient()

  const { data: documents, error: documentsError } = await supabase
    .schema('governance')
    .from('documents')
    .select('id,project_id,dataset_id,dataset_version_id,profile_run_id,source_uri,file_name,file_type,content_type,content_hash,extraction_method,character_count,chunk_count,metadata,updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (documentsError) throw new Error(`Unable to load governed documents: ${documentsError.message}`)

  const requestedDocumentId = requested.document?.trim() || null
  const selected = requestedDocumentId
    ? (documents ?? []).find((document) => document.id === requestedDocumentId) ?? null
    : documents?.[0] ?? null

  const chunks = selected
    ? await supabase
        .schema('governance')
        .from('document_chunks')
        .select('id,chunk_index,content,content_hash,character_count,metadata')
        .eq('document_id', selected.id)
        .order('chunk_index')
        .limit(2000)
    : { data: [], error: null }
  if (chunks.error) throw new Error(`Unable to load governed document chunks: ${chunks.error.message}`)

  const focusedChunkId = requested.chunk?.trim() || null

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Governed Documents</h1>
          <p className="mt-2 text-sm text-muted-foreground">Persisted extracted content used by profiling evidence and semantic governance search.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Documents</h2>
              <span className="text-xs text-muted-foreground">{documents?.length ?? 0}</span>
            </div>
            <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto">
              {(documents ?? []).map((document) => (
                <Link
                  key={document.id}
                  href={`/documents?document=${encodeURIComponent(document.id)}`}
                  className={`block rounded-lg border p-3 text-sm transition hover:bg-muted ${selected?.id === document.id ? 'bg-muted' : ''}`}
                >
                  <div className="font-medium">{document.file_name ?? document.source_uri}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{document.file_type.toUpperCase()} · {document.chunk_count} chunks</div>
                </Link>
              ))}
              {!documents?.length ? <p className="text-sm text-muted-foreground">No governed document content has been persisted yet.</p> : null}
            </div>
          </aside>

          <section className="rounded-xl border p-5">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selected.file_name ?? 'Governed document'}</h2>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{selected.source_uri}</p>
                  </div>
                  <Link href={`/catalog?dataset=${encodeURIComponent(selected.dataset_id)}`} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Open dataset</Link>
                </div>

                <dl className="mt-5 grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Type</dt><dd className="mt-1 font-medium">{selected.file_type.toUpperCase()}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Extraction</dt><dd className="mt-1 font-medium">{value(selected.extraction_method)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Characters</dt><dd className="mt-1 font-medium">{selected.character_count}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Chunks</dt><dd className="mt-1 font-medium">{selected.chunk_count}</dd></div>
                </dl>

                {selected.profile_run_id ? (
                  <div className="mt-4">
                    <Link href={`/profiling/explorer?runId=${encodeURIComponent(selected.profile_run_id)}`} className="text-sm font-medium underline">Open profiling run</Link>
                  </div>
                ) : null}

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Extracted Content</h3>
                    <span className="text-xs text-muted-foreground">{chunks.data?.length ?? 0} loaded chunks</span>
                  </div>
                  {(chunks.data ?? []).map((chunk) => (
                    <article
                      id={`chunk-${chunk.id}`}
                      key={chunk.id}
                      className={`rounded-lg border p-4 ${focusedChunkId === chunk.id ? 'ring-2 ring-violet-400' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Chunk {chunk.chunk_index}</span>
                        <span>{chunk.character_count} characters</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{chunk.content}</p>
                    </article>
                  ))}
                  {!chunks.data?.length ? <p className="text-sm text-muted-foreground">No readable extracted text was available for this document.</p> : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a governed document to inspect its extracted content.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
