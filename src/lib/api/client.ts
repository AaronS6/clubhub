/** Lightweight typed fetch wrapper for talking to our /api routes. */

export async function api<T = any>(
  path: string,
  options?: RequestInit & { json?: any }
): Promise<T> {
  const { json, ...init } = options ?? {}
  const headers: Record<string, string> = { ...(init.headers as any) }
  let body = init.body
  if (json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(json)
  }
  const res = await fetch(path, { ...init, headers, body, credentials: "same-origin" })
  const text = await res.text()
  const data = text ? (safeParse(text)) : null
  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data ? (data as any).error : `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

function safeParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Upload a file (multipart) to a given path. */
export async function apiUpload(path: string, formData: FormData): Promise<any> {
  const res = await fetch(path, { method: "POST", body: formData, credentials: "same-origin" })
  const text = await res.text()
  const data = text ? safeParse(text) : null
  if (!res.ok) {
    const message = data && typeof data === "object" && "error" in data ? (data as any).error : `Upload failed (${res.status})`
    throw new Error(message)
  }
  return data
}
