export const enum TokenType {
  Static,
  Param,
}

const enum TokenizerState {
  Static,
  Param,
  ParamRegExp, // custom re for a param
  EscapeNext,
}

interface TokenStatic {
  type: TokenType.Static
  value: string
}

interface TokenParam {
  type: TokenType.Param
  regexp?: string
  value: string
  optional: boolean
  repeatable: boolean
}

type Token = TokenStatic | TokenParam

// const ROOT_TOKEN: Token = {
//   type: TokenType.Static,
//   value: '/',
// }

const VALID_PARAM_RE = /[a-zA-Z0-9_]/

export function tokenizePath(path: string): Array<Token[]> {
  if (path === '/') return [[]]
  // remove the leading slash
  if (!path) throw new Error('An empty path cannot be tokenized')

  function crash(message: string) {
    throw new Error(`ERR (${state})/"${buffer}": ${message}`)
  }

  let state: TokenizerState = TokenizerState.Static
  let previousState: TokenizerState = state
  const tokens: Array<Token[]> = []
  // the segment will always be valid because we get into the initial state
  // with the leading /
  let segment!: Token[]

  function finalizeSegment() {
    if (segment) tokens.push(segment)
    segment = []
  }

  // index on the path
  let i = 0
  // char at index
  let char: string
  // buffer of the value read
  let buffer: string = ''
  // custom regexp for a param
  let customRe: string = ''

  function consumeBuffer() {
    if (!buffer) return

    if (state === TokenizerState.Static) {
      segment.push({
        type: TokenType.Static,
        value: buffer,
      })
    } else if (
      state === TokenizerState.Param ||
      state === TokenizerState.ParamRegExp
    ) {
      if (segment.length > 1 && (char === '*' || char === '+'))
        crash(
          `A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`
        )
      segment.push({
        type: TokenType.Param,
        value: buffer,
        regexp: customRe,
        repeatable: char === '*' || char === '+',
        optional: char === '*' || char === '?',
      })
    } else {
      crash('Invalid state to consume buffer')
    }
    buffer = ''
  }

  function addCharToBuffer() {
    buffer += char
  }

  while (i < path.length) {
    char = path[i++]

    if (char === '\\' && state !== TokenizerState.ParamRegExp) {
      previousState = state
      state = TokenizerState.EscapeNext
      continue
    }

    switch (state) {
      case TokenizerState.Static:
        if (char === '/') {
          if (buffer) {
            consumeBuffer()
          }
          finalizeSegment()
        } else if (char === ':') {
          consumeBuffer()
          state = TokenizerState.Param
        } else if (char === '{') {
          // TODO: handle group
        } else {
          addCharToBuffer()
        }
        break

      case TokenizerState.EscapeNext:
        addCharToBuffer()
        state = previousState
        break

      case TokenizerState.Param:
        if (char === '(') {
          state = TokenizerState.ParamRegExp
          customRe = ''
        } else if (VALID_PARAM_RE.test(char)) {
          addCharToBuffer()
        } else {
          consumeBuffer()
          state = TokenizerState.Static
          // go back one character if we were not modifying
          if (char !== '*' && char !== '?' && char !== '+') {
            i--
          }
        }
        break

      case TokenizerState.ParamRegExp:
        if (char === ')') {
          consumeBuffer()
          state = TokenizerState.Static
        } else {
          customRe += char
        }
        break

      default:
        crash('Unkwnonw state')
        break
    }
  }

  if (state === TokenizerState.ParamRegExp)
    crash(`Unfinished custom RegExp for param "${buffer}"`)

  consumeBuffer()
  finalizeSegment()

  return tokens
}

type Params = Record<string, string | string[]>

interface ParamKey {
  name: string
  repeatable: boolean
  optional: boolean
}

interface PathParser {
  re: RegExp
  score: number
  keys: ParamKey[]
  parse(path: string): Params | null
  stringify(params: Params): string
}

const BASE_PARAM_PATTERN = '[^/]+?'

export function tokensToParser(segments: Array<Token[]>): PathParser {
  let score = 0
  let pattern = '^'
  const keys: ParamKey[] = []

  for (const segment of segments) {
    pattern += '/'

    for (const token of segment) {
      if (token.type === TokenType.Static) {
        pattern += token.value
      } else if (token.type === TokenType.Param) {
        keys.push({
          name: token.value,
          repeatable: token.repeatable,
          optional: token.optional,
        })
        const re = token.regexp ? token.regexp : BASE_PARAM_PATTERN
        pattern += token.repeatable ? `((?:${re})(?:/(?:${re}))*)` : `(${re})`
        if (token.optional) pattern += '?'
      }
    }
  }

  pattern += '$'

  const re = new RegExp(pattern)

  function parse(path: string): Params | null {
    const match = path.match(re)
    const params: Params = {}

    if (!match) return null

    for (let i = 1; i < match.length; i++) {
      const value: string = match[i] || ''
      const key = keys[i - 1]
      params[key.name] = value && key.repeatable ? value.split('/') : value
    }

    return params
  }

  function stringify(params: Params): string {
    let path = ''
    // TODO: implem

    return path
  }

  return {
    re,
    score,
    keys,
    parse,
    stringify,
  }
}