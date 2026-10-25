export function installMarketTranslationProbe() {
  const original = globalThis.fetch
  const requests = []
  const intercepted = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const google = url.origin === 'https://translate-pa.googleapis.com' && url.pathname === '/v1/translateHtml'
    const microsoft = url.origin === 'https://edge.microsoft.com' && url.pathname === '/translate/translatetext'
    if (!google && !microsoft) return original(input, init)
    const body = JSON.parse(init.body)
    requests.push({ provider: google ? 'google' : 'microsoft', method: init.method, body })
    if (google) return new Response('Controlled Google failure', { status: 503 })
    return Response.json(body.map(text => ({ translations: [{
      text: text.split(/(⟦[A-Z]\d+⟧)/u).map(part => /^⟦[A-Z]\d+⟧$/u.test(part) || !part.trim()
        ? part : '隔离供应商翻译结果。').join(''),
    }] })))
  }
  globalThis.fetch = intercepted
  return {
    requests,
    dispose() { if (globalThis.fetch === intercepted) globalThis.fetch = original },
  }
}
