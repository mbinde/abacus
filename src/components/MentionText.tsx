interface Props {
  text: string
  onMentionClick?: (username: string) => void
}

export default function MentionText({ text, onMentionClick }: Props) {
  // Parse @mentions from text
  const parts = parseMentions(text)

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              style={{
                color: '#4dc3ff',
                fontWeight: 600,
                cursor: onMentionClick ? 'pointer' : 'default',
              }}
              onClick={() => onMentionClick?.(part.username)}
              title={`@${part.username}`}
            >
              @{part.username}
            </span>
          )
        }
        return <span key={i}>{part.text}</span>
      })}
    </span>
  )
}

interface TextPart {
  type: 'text'
  text: string
}

interface MentionPart {
  type: 'mention'
  username: string
}

type Part = TextPart | MentionPart

function parseMentions(text: string): Part[] {
  const parts: Part[] = []
  // Match @username pattern (alphanumeric, hyphens, underscores)
  const mentionRegex = /@([a-zA-Z0-9][-a-zA-Z0-9_]*)/g

  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        text: text.slice(lastIndex, match.index),
      })
    }

    // Add the mention
    parts.push({
      type: 'mention',
      username: match[1],
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      text: text.slice(lastIndex),
    })
  }

  return parts
}

// Extract all mentioned usernames from text
export function extractMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9][-a-zA-Z0-9_]*)/g
  const mentions: string[] = []
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
    if (!mentions.includes(match[1])) {
      mentions.push(match[1])
    }
  }

  return mentions
}
