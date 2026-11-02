const BLOCKED_ELEMENTS = new Set(['script', 'foreignobject'])

function parseViewBox(value) {
  if (!value) return null

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part)) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  ) {
    return null
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  }
}

function parseDimension(value) {
  if (!value || value.includes('%')) return null
  const number = Number.parseFloat(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function hasUnsafeUrl(value) {
  const compact = value.replace(/[\u0000-\u0020]+/g, '').toLowerCase()
  return compact.startsWith('javascript:') || compact.startsWith('data:text/html')
}

/**
 * Parse a local SVG, remove executable content, and normalize it for the
 * marker canvas. The returned viewBox is also the coordinate space used by
 * exported marker points.
 */
export function prepareSvg(raw, name = 'image.svg') {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(raw, 'image/svg+xml')
  const parseError = parsed.querySelector('parsererror')
  const root = parsed.documentElement

  if (parseError || root.localName.toLowerCase() !== 'svg') {
    throw new Error('The selected file is not a valid SVG')
  }

  const elements = [root, ...root.querySelectorAll('*')]

  elements.forEach((element) => {
    if (element !== root && BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove()
      return
    }

    for (const attribute of [...element.attributes]) {
      const attributeName = attribute.name.toLowerCase()
      const value = attribute.value

      if (
        attributeName.startsWith('on') ||
        ((attributeName === 'href' || attributeName.endsWith(':href')) &&
          hasUnsafeUrl(value)) ||
        (attributeName === 'style' &&
          /(?:javascript\s*:|expression\s*\()/i.test(value))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  })

  const existingViewBox = parseViewBox(root.getAttribute('viewBox'))
  const width = parseDimension(root.getAttribute('width'))
  const height = parseDimension(root.getAttribute('height'))
  const fallbackSize = width || height || 1000
  const viewBox = existingViewBox || {
    minX: 0,
    minY: 0,
    width: width || fallbackSize,
    height: height || fallbackSize,
  }

  root.setAttribute(
    'viewBox',
    `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`,
  )
  root.removeAttribute('width')
  root.removeAttribute('height')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('role', 'img')

  return {
    name,
    markup: new XMLSerializer().serializeToString(root),
    ...viewBox,
  }
}

export function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

export function markerOutput(svg, markers) {
  if (!markers.length) return ''

  const viewBox = [svg.minX, svg.minY, svg.width, svg.height].map(formatNumber).join(' ')
  const lines = [
    `Image: ${svg.name}`,
    `ViewBox: ${viewBox}`,
    `Size: ${formatNumber(svg.width)} × ${formatNumber(svg.height)}`,
    `Markers: ${markers.length}`,
    '',
  ]

  markers.forEach((marker, index) => {
    lines.push(
      `${index + 1}. x: ${formatNumber(marker.x)}, y: ${formatNumber(marker.y)}, radius: ${formatNumber(marker.r)}`,
    )
  })

  return lines.join('\n')
}
