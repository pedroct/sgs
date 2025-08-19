import React, { useEffect, useMemo, useState } from 'react'

/** Resolve a base da API pela ordem:
 *  1) VITE_API_BASE (env do Vite)
 *  2) window.API_URL (injeção via script)
 *  3) localStorage.API_URL (override manual)
 *  4) ''  -> usa proxy da mesma origem em /api
 */
const resolveApiBase = (): string => {
  let base = ''
  try {
    // 1) Vite env
    const vite = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || ''
    if (vite) base = vite

    // 2) window.API_URL
    if (!base && typeof window !== 'undefined' && (window as any).API_URL) {
      base = (window as any).API_URL as string
    }

    // 3) localStorage.API_URL
    if (!base && typeof window !== 'undefined') {
      base = localStorage.getItem('API_URL') || ''
    }
  } catch {
    // ignora erros de acesso ao localStorage em navegação privada, etc.
  }

  return String(base || '').trim().replace(/\/+$/, '')
}

const API_BASE = resolveApiBase()
// se base vier vazia, usa o proxy do Nginx em /api
const UPLOAD_URL = API_BASE ? `${API_BASE}/upload` : `/api/upload`

type Summary = {
  total_following: number
  total_followers_unicos: number
  nao_seguem_de_volta: number
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const normalize = (u: string) => u.trim().replace(/^@/, '').toLowerCase()

export default function App() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [list, setList] = useState<string[]>([])
  const [q, setQ] = useState('')

  // Paginação
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [pageInput, setPageInput] = useState('1')

  // "Pular verificados" (lista personalizada)
  const [skipVerified, setSkipVerified] = useState(false)
  const [verifiedSet, setVerifiedSet] = useState<Set<string>>(new Set())
  const [verifiedText, setVerifiedText] = useState('')
  const [showVerifiedCfg, setShowVerifiedCfg] = useState(false)

  // carrega lista salva no localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('verified_skip_list') || ''
      const arr = raw.split(/\r?\n/).map(normalize).filter(Boolean)
      setVerifiedSet(new Set(arr))
      setVerifiedText(arr.join('\n'))
    } catch {}
  }, [])

  const filteredBase = useMemo(() => {
    if (!q) return list
    const s = q.toLowerCase()
    return list.filter(u => u.toLowerCase().includes(s))
  }, [q, list])

  const filtered = useMemo(() => {
    if (!skipVerified) return filteredBase
    if (!verifiedSet.size) return filteredBase
    return filteredBase.filter(u => !verifiedSet.has(normalize(u)))
  }, [filteredBase, skipVerified, verifiedSet])

  // sempre que o filtro/lista/toggle mudar, volte para a página 1
  useEffect(() => { setPage(1) }, [q, list, skipVerified, verifiedSet])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize])

  // garanta que a página atual não ultrapasse o total ao mudar o pageSize/filtro
  useEffect(() => { setPage(p => Math.min(p, totalPages)) }, [totalPages])

  // sincroniza o input com a página atual
  useEffect(() => { setPageInput(String(page)) }, [page])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  const onDrop = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault()
    const f = Array.from(ev.dataTransfer.files || [])
    setFiles(prev => [...prev, ...f])
  }

  const onSelect = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(ev.target.files || [])
    setFiles(prev => [...prev, ...f])
  }

  const onRemove = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const onUpload = async () => {
    setError('')
    if (!files.length) {
      setError('Selecione ao menos um arquivo JSON exportado do Instagram.')
      return
    }
    setLoading(true)
    setSummary(null)
    setList([])

    try {
      const fd = new FormData()
      for (const f of files) fd.append('files', f)

      const res = await fetch(UPLOAD_URL, { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(msg.detail || 'Falha no upload/processamento')
      }
      const data = await res.json()
      setSummary(data.summary as Summary)
      setList((data.not_following_back || []) as string[])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Atalhos de teclado: ← / → para navegar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (target as any)?.isContentEditable) return
      if (e.key === 'ArrowLeft') setPage(p => Math.max(1, p - 1))
      if (e.key === 'ArrowRight') setPage(p => Math.min(totalPages, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [totalPages])

  const goToPage = () => {
    const n = Number(pageInput)
    if (Number.isFinite(n)) setPage(clamp(Math.trunc(n), 1, totalPages))
  }

  const saveVerifiedList = () => {
    const arr = verifiedText.split(/\r?\n/).map(normalize).filter(Boolean)
    const set = new Set(arr)
    setVerifiedSet(set)
    localStorage.setItem('verified_skip_list', arr.join('\n'))
  }

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Gestão de Seguidores do Instagram</h1>
        <p className="text-gray-600">Envie os arquivos JSON exportados pelo Instagram e veja quem você segue e não te segue de volta.</p>
      </header>

      <section className="grid md:grid-cols-3 gap-4 mb-6">
        <Card label="Seguindo" value={summary?.total_following ?? '-'} />
        <Card label="Seguidores" value={summary?.total_followers_unicos ?? '-'} />
        <Card label="Não seguem de volta" value={summary?.nao_seguem_de_volta ?? '-'} highlight />
      </section>

      <section className="mb-6">
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-6 bg-white flex flex-col items-center justify-center text-center"
        >
          <p className="mb-2 font-medium">Arraste e solte aqui seus JSONs</p>
          <p className="text-sm text-gray-500">Ex.: <code>following.json</code>, <code>followers_1.json</code>, <code>followers_2.json</code>…</p>
          <div className="mt-4">
            <label className="inline-block px-4 py-2 bg-gray-900 text-white rounded-xl cursor-pointer">
              Selecionar arquivos
              <input type="file" multiple accept="application/json" className="hidden" onChange={onSelect} />
            </label>
          </div>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 bg-white rounded-xl p-3 shadow divide-y">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700 truncate">{f.name}</span>
                <button onClick={() => onRemove(i)} className="text-red-600 text-sm">remover</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <button onClick={onUpload} disabled={loading} className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50">
            {loading ? 'Processando…' : 'Processar'}
          </button>
        </div>
        {error && <p className="mt-3 text-red-600">{error}</p>}
      </section>

      {list.length > 0 && (
        <section className="bg-white rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="font-semibold">Quem não me segue de volta ({list.length})</h2>
            <div className="flex items-center gap-3 ml-auto">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-blue-600" checked={skipVerified} onChange={(e) => setSkipVerified(e.target.checked)} />
                Pular verificados
              </label>
              <button
                className="px-3 py-1 rounded-lg border"
                onClick={() => setShowVerifiedCfg(v => !v)}
                title="Configurar lista de verificados (exceções)"
              >
                Configurar verificados
              </button>
              <input
                className="border rounded-xl px-3 py-2 text-sm"
                placeholder="Filtrar por username…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {/* Controles de paginação */}
          <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
            <button
              className="px-3 py-1 rounded-lg border disabled:opacity-50"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              title="Anterior (atalho: ←)"
            >
              ← Anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button
              className="px-3 py-1 rounded-lg border disabled:opacity-50"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              title="Próxima (atalho: →)"
            >
              Próxima →
            </button>
            <span className="ml-2">Itens por página:</span>
            <select
              className="border rounded-lg px-2 py-1"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>

            {/* Ir para página */}
            <span className="ml-2">Ir para:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goToPage() }}
              className="border rounded-lg px-2 py-1 w-20"
            />
            <button className="px-3 py-1 rounded-lg border" onClick={goToPage}>Ir</button>

            <span className="ml-auto text-gray-500">
              {filtered.length ? `${(page - 1) * pageSize + 1}–${Math.min(filtered.length, page * pageSize)} de ${filtered.length}` : '0 de 0'}
            </span>
          </div>

          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="text-left p-2">Username</th>
                  <th className="text-left p-2">Perfil</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(u => (
                  <tr key={u} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 font-mono">{u}</td>
                    <td className="p-2">
                      <a href={`https://www.instagram.com/${u}`} target="_blank" rel="noreferrer" className="text-blue-600">abrir</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="text-xs text-gray-500 mt-6">
        Dica: Use ←/→ para navegar.
      </footer>
    </div>
  )
}

function Card({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow border ${highlight ? 'border-red-200' : 'border-gray-100'}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
