/* Deterministic mock OpenAI-compatible server used by the E2E test suite.
   Serves /api/tags (Ollama-style), /v1/models, and /v1/chat/completions with
   canned curriculum responses so tests never depend on a real LLM. */
import http from 'http'

const PORT = process.env.MOCK_PORT || 5001

const server = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }, { name: 'mistral' }, { name: 'gemma2' }] }))
    return
  }
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-gpt' }, { id: 'mock-turbo' }] }))
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let payload = {}
    try { payload = JSON.parse(body) } catch { /* ignore */ }
    const prompt = (payload.messages || []).map((m) => m.content).join('\n')
    let reply
    if (prompt.includes('"title"') && prompt.includes('"topics"')) {
      reply = {
        title: 'Frontend Engineering Roadmap',
        topics: ['HTML and CSS Fundamentals', 'JavaScript', 'React', 'Next.js', 'State Management', 'APIs and Data', 'Testing', 'Tooling and Build', 'Deployment and DevOps', 'Performance and Accessibility']
      }
    } else if (prompt.includes('"topics"')) {
      reply = { topics: ['Math basics', 'Statistics', 'Linear algebra', 'Python', 'Classical ML', 'Deep learning'] }
    } else if (prompt.includes('"subtopics"')) {
      reply = {
        subtopics: [
          { title: 'Intro', items: ['What is X', 'Why it matters', 'Core vocabulary'] },
          { title: 'Core methods', items: ['Main algorithm', 'Worked example'] }
        ]
      }
    } else if (prompt.includes('"summary"')) {
      reply = { summary: 'A concise explanation.', keyPoints: ['One'], learnByDoing: 'Practice.', resources: ['Book'] }
    } else {
      const sys = (payload.messages || []).find((m) => m.role === 'system')?.content || ''
      const last = (payload.messages || []).filter((m) => m.role === 'user').pop()?.content || ''
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: `Answer to "${last}". (System context: ${sys.slice(0, 80)}…)` } }] }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(reply) } }] }))
  })
})

server.listen(PORT, () => console.log(`mock ai on ${PORT}`))
