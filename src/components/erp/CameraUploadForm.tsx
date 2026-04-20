// src/components/erp/CameraUploadForm.tsx — Alpha Quantum ERP v17
import { useState, useRef } from 'react'

interface Props {
  onUpload?: (url: string) => void
  onUploaded?: (files: { url: string; name: string }[]) => void
  label?: string
  accept?: string
  folder?: string
  entityType?: string
  entityId?: string
  multiple?: boolean
}

export default function CameraUploadForm({
  onUpload,
  onUploaded,
  label = 'Upload File',
  accept = 'image/*,application/pdf',
  folder = 'uploads',
  entityType,
  entityId,
  multiple = false,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [progress, setProgress]   = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    for (const f of files) {
      if (f.size > 15 * 1024 * 1024) { setError(`"${f.name}" is too large (max 15 MB)`); return }
    }

    setUploading(true); setError(''); setProgress('')
    const results: { url: string; name: string }[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setProgress(`Uploading ${i + 1}/${files.length}…`)
        const base64 = await readAsBase64(file)
        const token  = localStorage.getItem('erp_token')
        const res    = await fetch('/api?r=uploads%2Ffile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            data:     base64.split(',')[1] ?? base64,
            filename: file.name,
            mimetype: file.type,
            folder:   entityType ? `${folder}/${entityType}` : folder,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        results.push({ url: data.url, name: file.name })
        // Backward-compat: call onUpload for first file
        if (i === 0 && onUpload) onUpload(data.url)
      }
      if (onUploaded) onUploaded(results)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setProgress('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFiles}
        style={{ display: 'none' }}
        capture="environment"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn btn-secondary btn-sm"
        style={{ justifyContent: 'center' }}
      >
        {uploading ? `⏳ ${progress || 'Uploading…'}` : `📎 ${label}`}
      </button>
      {error && (
        <span style={{ color: 'var(--rose)', fontSize: '.78rem' }}>{error}</span>
      )}
    </div>
  )
}
