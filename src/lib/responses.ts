export function responsesUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/responses`
}

export function extractResponseText(response: any): string {
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text

  const text = response.output
    ?.flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n')

  if (!text) throw new Error('The service returned an empty response.')
  return text
}
