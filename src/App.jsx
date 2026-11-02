import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MarkerCanvas from './components/MarkerCanvas'
import { markerOutput, prepareSvg } from './lib/svg'

function createRadiusControls(svg) {
  const shortestSide = Math.min(svg.width, svg.height)
  return {
    min: Math.max(1, Math.round(shortestSide / 192)),
    max: Math.max(20, Math.round(shortestSide * 0.1)),
    step: Math.max(1, Math.round(shortestSide / 1000)),
    initial: Math.max(1, Math.round(shortestSide * (36 / 1536))),
  }
}

export default function App() {
  const [svg, setSvg] = useState(null)
  const [markers, setMarkers] = useState([])
  const [selectedMarkerId, setSelectedMarkerId] = useState(null)
  const [newRadius, setNewRadius] = useState(36)
  const [showRanges, setShowRanges] = useState(true)
  const [loupeEnabled, setLoupeEnabled] = useState(true)
  const [ghost, setGhost] = useState(null)
  const [ghostOpacity, setGhostOpacity] = useState(45)
  const [dropVisible, setDropVisible] = useState(false)
  const [notice, setNotice] = useState('')
  const markerIdRef = useRef(1)
  const noticeTimerRef = useRef(null)
  const outputRef = useRef(null)
  const canvasRef = useRef(null)
  const svgInputRef = useRef(null)
  const ghostInputRef = useRef(null)
  const dragDepthRef = useRef(0)

  const radiusControls = useMemo(
    () => (svg ? createRadiusControls(svg) : { min: 8, max: 140, step: 1 }),
    [svg],
  )
  const output = useMemo(
    () => (svg ? markerOutput(svg, markers) : ''),
    [markers, svg],
  )

  const flash = useCallback((message) => {
    window.clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2200)
  }, [])

  useEffect(() => {
    return () => window.clearTimeout(noticeTimerRef.current)
  }, [])

  useEffect(() => {
    return () => {
      if (ghost?.url) URL.revokeObjectURL(ghost.url)
    }
  }, [ghost])

  useEffect(() => {
    setNewRadius((current) => {
      return Math.min(radiusControls.max, Math.max(radiusControls.min, current))
    })
  }, [radiusControls.max, radiusControls.min])

  const loadSvgFile = useCallback(
    async (file) => {
      if (!file) return
      if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
        flash('Please choose an .svg file')
        return
      }

      try {
        const raw = await file.text()
        const nextSvg = prepareSvg(raw, file.name)
        const nextRadius = createRadiusControls(nextSvg)

        setSvg(nextSvg)
        setMarkers([])
        setSelectedMarkerId(null)
        setNewRadius(nextRadius.initial)
        flash(`Loaded ${file.name}`)
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Could not read the SVG')
      }
    },
    [flash],
  )

  const loadGhostFile = useCallback(
    (file) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        flash('The reference must be an image file')
        return
      }

      setGhost({
        url: URL.createObjectURL(file),
        name: file.name,
      })
      setGhostOpacity(45)
      flash(`Loaded reference ${file.name}`)
    },
    [flash],
  )

  const handleDroppedFile = useCallback(
    (file) => {
      if (!file) return
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
        loadSvgFile(file)
      } else if (file.type.startsWith('image/')) {
        loadGhostFile(file)
      } else {
        flash('Only SVG and image files are supported')
      }
    },
    [flash, loadGhostFile, loadSvgFile],
  )

  useEffect(() => {
    const handleDragEnter = (event) => {
      event.preventDefault()
      dragDepthRef.current += 1
      if (event.dataTransfer?.types.includes('Files')) setDropVisible(true)
    }
    const handleDragOver = (event) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const handleDragLeave = (event) => {
      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDropVisible(false)
    }
    const handleDrop = (event) => {
      event.preventDefault()
      dragDepthRef.current = 0
      setDropVisible(false)
      handleDroppedFile(event.dataTransfer?.files?.[0])
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleDroppedFile])

  const addMarker = useCallback(
    (x, y) => {
      const marker = {
        id: markerIdRef.current,
        x,
        y,
        r: newRadius,
      }
      markerIdRef.current += 1
      setMarkers((current) => [...current, marker])
      setSelectedMarkerId(marker.id)
    },
    [newRadius],
  )

  const moveMarker = useCallback((id, x, y) => {
    setMarkers((current) =>
      current.map((marker) => (marker.id === id ? { ...marker, x, y } : marker)),
    )
  }, [])

  const changeMarkerRadius = useCallback((id, radius) => {
    const nextRadius = Math.max(1, Number(radius) || 1)
    setMarkers((current) =>
      current.map((marker) =>
        marker.id === id ? { ...marker, r: nextRadius } : marker,
      ),
    )
  }, [])

  const deleteMarker = useCallback((id) => {
    setMarkers((current) => current.filter((marker) => marker.id !== id))
    setSelectedMarkerId((current) => (current === id ? null : current))
  }, [])

  const undoMarker = () => {
    setMarkers((current) => current.slice(0, -1))
    setSelectedMarkerId(null)
  }

  const clearMarkers = () => {
    if (!markers.length) return
    setMarkers([])
    setSelectedMarkerId(null)
    flash('Cleared all markers')
  }

  const copyOutput = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      flash('Coordinates copied')
    } catch {
      outputRef.current?.select()
      document.execCommand('copy')
      flash('Coordinates copied')
    }
  }

  const downloadJson = () => {
    const data = {
      image: svg.name,
      size: svg.width === svg.height ? svg.width : [svg.width, svg.height],
      viewBox: [svg.minX, svg.minY, svg.width, svg.height],
      points: markers.map(({ x, y, r }) => ({ x, y, r })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'marker-points.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    flash('JSON downloaded')
  }

  return (
    <main className="app-shell">
      {svg ? (
        <MarkerCanvas
          ref={canvasRef}
          svg={svg}
          markers={markers}
          selectedMarkerId={selectedMarkerId}
          showRanges={showRanges}
          loupeEnabled={loupeEnabled}
          ghostUrl={ghost?.url}
          ghostName={ghost?.name}
          ghostOpacity={ghostOpacity}
          dropVisible={dropVisible}
          onSelectMarker={setSelectedMarkerId}
          onAddMarker={addMarker}
          onMoveMarker={moveMarker}
          onDeleteMarker={deleteMarker}
        />
      ) : (
        <section className="stage empty-stage" aria-label="SVG marker canvas">
          <div className="empty-canvas-card">
            <svg
              className="empty-canvas-icon"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path d="M10 6h18l10 10v26H10z" />
              <path d="M28 6v10h10M17 28h14M17 34h10" />
            </svg>
            <h2>Open an SVG to begin</h2>
            <p>
              Choose a file from your device or drop one anywhere on this canvas.
            </p>
            <button
              className="button primary empty-canvas-button"
              type="button"
              onClick={() => svgInputRef.current?.click()}
            >
              Choose local SVG
            </button>
          </div>
          {dropVisible && <div className="drop-overlay">Drop to load file</div>}
        </section>
      )}

      <aside className="sidebar">
        <header className="sidebar-header">
          <p className="eyebrow">SVG MARKER</p>
          <h1>SVG Marker</h1>
          <p className="intro">
            Click to place markers. Coordinates follow the current SVG viewBox
            and can be copied or exported as JSON.
          </p>
          <div
            className={`file-pill${svg ? ' loaded' : ''}`}
            title={svg?.name || 'No SVG loaded'}
          >
            <span className="file-status-dot" />
            <span>{svg?.name || 'No SVG loaded'}</span>
          </div>
        </header>

        <section className="panel-section file-section">
          <div className="section-heading">
            <h2>Image</h2>
            <span className="section-meta">
              {svg ? `${svg.width} × ${svg.height}` : 'No file loaded'}
            </span>
          </div>
          <input
            ref={svgInputRef}
            className="visually-hidden"
            type="file"
            accept=".svg,image/svg+xml"
            onChange={(event) => {
              loadSvgFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            className="button primary full-width"
            type="button"
            onClick={() => svgInputRef.current?.click()}
          >
            Choose local SVG
          </button>
          <p className="helper">
            You can also drop an SVG onto the canvas. Switching images clears
            the current markers.
          </p>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>View</h2>
          </div>
          <div className="button-grid four">
            <button
              className="button"
              type="button"
              onClick={() => canvasRef.current?.fit()}
              disabled={!svg}
            >
              Fit
            </button>
            <button
              className="button"
              type="button"
              onClick={() => canvasRef.current?.actualSize()}
              disabled={!svg}
            >
              100%
            </button>
            <button
              className="button"
              type="button"
              onClick={() => canvasRef.current?.zoomIn()}
              aria-label="Zoom in"
              disabled={!svg}
            >
              ＋
            </button>
            <button
              className="button"
              type="button"
              onClick={() => canvasRef.current?.zoomOut()}
              aria-label="Zoom out"
              disabled={!svg}
            >
              −
            </button>
          </div>
          <div className="check-row">
            <label className="check-label">
              <input
                type="checkbox"
                checked={loupeEnabled}
                onChange={(event) => setLoupeEnabled(event.target.checked)}
              />
              Loupe (8×)
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showRanges}
                onChange={(event) => setShowRanges(event.target.checked)}
              />
              Show marker radius
            </label>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>New marker</h2>
            <span className="radius-value">{newRadius} px</span>
          </div>
          <label className="range-label" htmlFor="radius-range">
            <span>Marker radius</span>
            <input
              id="radius-range"
              type="range"
              min={radiusControls.min}
              max={radiusControls.max}
              step={radiusControls.step}
              value={newRadius}
              onChange={(event) => setNewRadius(Number(event.target.value))}
              disabled={!svg}
            />
          </label>
          <div className="button-grid">
            <button
              className="button"
              type="button"
              onClick={undoMarker}
              disabled={!markers.length}
            >
              Undo last marker
            </button>
            <button
              className="button danger"
              type="button"
              onClick={clearMarkers}
              disabled={!markers.length}
            >
              Clear all
            </button>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Reference overlay</h2>
            <span className="section-meta">Optional</span>
          </div>
          <label className="range-label" htmlFor="ghost-opacity">
            <span>Opacity</span>
            <div className="range-with-value">
              <input
                id="ghost-opacity"
                type="range"
                min="0"
                max="100"
                step="1"
                value={ghostOpacity}
                onChange={(event) => setGhostOpacity(Number(event.target.value))}
              />
              <b>{ghostOpacity}%</b>
            </div>
          </label>
          <input
            ref={ghostInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              loadGhostFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            className="button full-width"
            type="button"
            onClick={() => ghostInputRef.current?.click()}
          >
            {ghost ? `Change reference · ${ghost.name}` : 'Choose reference image'}
          </button>
        </section>

        <section className="markers-section">
          <div className="section-heading marker-heading">
            <h2>
              Markers <span className="count-badge">{markers.length}</span>
            </h2>
            {notice && (
              <span className="notice" role="status">
                {notice}
              </span>
            )}
          </div>
          <div className="marker-list-wrap">
            {markers.length === 0 ? (
              <div className="empty-state">
                No markers yet. Click anywhere on the SVG to add one.
              </div>
            ) : (
              <ol className="marker-list">
                {markers.map((marker, index) => (
                  <li
                    key={marker.id}
                    className={marker.id === selectedMarkerId ? 'selected' : ''}
                    onClick={() => setSelectedMarkerId(marker.id)}
                  >
                    <span className="marker-index">{index + 1}</span>
                    <span className="marker-coordinate">
                      x {marker.x.toFixed(1)} · y {marker.y.toFixed(1)}
                    </span>
                    <label className="marker-radius" title="Marker radius">
                      <span className="visually-hidden">
                        Radius for marker {index + 1}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max={radiusControls.max}
                        step={radiusControls.step}
                        value={Number(marker.r.toFixed(2))}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          changeMarkerRadius(marker.id, event.target.value)
                        }
                      />
                    </label>
                    <button
                      className="icon-button delete-button"
                      type="button"
                      title="Delete marker"
                      aria-label={`Delete marker ${index + 1}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteMarker(marker.id)
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <textarea
              ref={outputRef}
              className="coordinate-output"
              value={output}
              readOnly
              spellCheck="false"
              aria-label="Marker coordinate output"
              placeholder="Markers and coordinates will appear here"
            />
            <div className="button-grid output-actions">
              <button
                className="button primary"
                type="button"
                onClick={copyOutput}
                disabled={!markers.length}
              >
                Copy coordinates
              </button>
              <button
                className="button"
                type="button"
                onClick={downloadJson}
                disabled={!markers.length}
              >
                Download JSON
              </button>
            </div>
          </div>
        </section>
      </aside>
    </main>
  )
}
