import { execute } from './index.mjs'

const TOOL_NAME = 'calculate'

const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'asOf', 'input'],
  properties: {
    operation: {
      type: 'string',
      description: 'One deterministic operation exposed by the evidence-gated metrics core.',
    },
    asOf: {
      type: 'string',
      description: 'The AMP invocation asOf instant, copied verbatim.',
    },
    input: {
      type: 'object',
      description: 'Operation-specific structured input. Call inputContracts for supported keys and vocabulary. Missing values must remain missing; unknown keys are rejected for guarded operations. Never persist a null nextState.',
    },
  },
}

function success(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function failure(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

export function handleMcpRequest(request) {
  const id = request?.id
  if (request?.jsonrpc !== '2.0' || typeof request?.method !== 'string') {
    return failure(id, -32600, 'Invalid JSON-RPC request')
  }

  if (request.method === 'initialize') {
    return success(id, {
      protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'evidence-gated-metrics', version: '0.1.0' },
    })
  }
  if (request.method === 'ping') return success(id, {})
  if (request.method === 'tools/list') {
    return success(id, {
      tools: [
        {
          name: TOOL_NAME,
          description:
            'Runs the package deterministic metrics, source-parser, scheduling, sizing, ' +
            'calibration, attribution or methodology core without network, files, credentials, ' +
            'database or order access. Returns explicit blocked/unevaluated diagnostics.',
          inputSchema,
        },
      ],
    })
  }
  if (request.method === 'tools/call') {
    if (request.params?.name !== TOOL_NAME) return failure(id, -32602, 'Unknown tool')
    const output = execute(request.params?.arguments)
    return success(id, {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output,
      isError: false,
    })
  }
  if (request.method.startsWith('notifications/')) return null
  return failure(id, -32601, 'Method not found')
}
