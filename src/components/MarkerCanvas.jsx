import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const MIN_ZOOM = 0.08
const MAX_ZOOM = 60
const LOUPE_SIZE = 240
const LOUPE_ZOOM = 8

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const MarkerCanvas = forwardRef(function MarkerCanvas(
  {
    svg,
    markers,
    selectedMarkerId,
    showRanges,
    loupeEnabled,
    ghostUrl,
    ghostName,
    ghostOpacity,
    dropVisible,
    onSelectMarker,
    onAddMarker,
    onMoveMarker,
    onDeleteMarker,
  },
  ref,
) {
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const viewRef = useRef({ scale: 1, x: 0, y: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [cursor, setCursor] = useState(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [panning, setPanning] = useState(false)

  viewRef.current = view

  const commitView = useCallback((nextView) => {
    viewRef.current = nextView
    setView(nextView)
  }, [])

  const getStageRect = useCallback(() => {
    return stageRef.current?.getBoundingClientRect()
  }, [])

  const fit = useCallback(() => {
    const rect = getStageRect()
    if (!rect?.width || !rect?.height) return

    const scale = Math.min(rect.width / svg.width, rect.height / svg.height) * 0.94
    const nextView = {
      scale,
      x: (rect.width - svg.width * scale) / 2,
      y: (rect.height - svg.height * scale) / 2,
    }

    commitView(nextView)
  }, [commitView, getStageRect, svg.height, svg.width])

  const zoomAt = useCallback(
    (clientX, clientY, factor) => {
      const rect = getStageRect()
      if (!rect) return

      const pointerX = clientX - rect.left
      const pointerY = clientY - rect.top

      setView((current) => {
        const nextScale = clamp(current.scale * factor, MIN_ZOOM, MAX_ZOOM)
        const ratio = nextScale / current.scale
        const nextView = {
          scale: nextScale,
          x: pointerX - (pointerX - current.x) * ratio,
          y: pointerY - (pointerY - current.y) * ratio,
        }
        viewRef.current = nextView
        return nextView
      })
    },
    [getStageRect],
  )

  const zoomAtCenter = useCallback(
    (factor) => {
      const rect = getStageRect()
      if (!rect) return
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
    },
    [getStageRect, zoomAt],
  )

  const setActualSize = useCallback(() => {
    const rect = getStageRect()
    if (!rect) return

    commitView({
      scale: 1,
      x: (rect.width - svg.width) / 2,
      y: (rect.height - svg.height) / 2,
    })
  }, [commitView, getStageRect, svg.height, svg.width])

  useImperativeHandle(
    ref,
    () => ({
      fit,
      actualSize: setActualSize,
      zoomIn: () => zoomAtCenter(1.35),
      zoomOut: () => zoomAtCenter(1 / 1.35),
    }),
    [fit, setActualSize, zoomAtCenter],
  )

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    const resize = () => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      })
    }

    resize()
    fit()

    const observer = new ResizeObserver(() => {
      resize()
      fit()
    })
    observer.observe(stage)

    return () => observer.disconnect()
  }, [fit])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    const handleWheel = (event) => {
      event.preventDefault()
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0016))
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [zoomAt])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeTag = document.activeElement?.tagName
      const activeIsEditable =
        /^(INPUT|TEXTAREA|SELECT)$/.test(activeTag || '') ||
        document.activeElement?.isContentEditable
      if (activeIsEditable) return

      if (event.key === '0') {
        event.preventDefault()
        fit()
        return
      }

      if (!selectedMarkerId) return
      const marker = markers.find((item) => item.id === selectedMarkerId)
      if (!marker) return

      if (event.key.startsWith('Arrow')) {
        const step = event.shiftKey ? 10 : 1
        let x = marker.x
        let y = marker.y
        if (event.key === 'ArrowLeft') x -= step
        if (event.key === 'ArrowRight') x += step
        if (event.key === 'ArrowUp') y -= step
        if (event.key === 'ArrowDown') y += step

        onMoveMarker(
          marker.id,
          clamp(x, svg.minX, svg.minX + svg.width),
          clamp(y, svg.minY, svg.minY + svg.height),
        )
        event.preventDefault()
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        onDeleteMarker(marker.id)
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    fit,
    markers,
    onDeleteMarker,
    onMoveMarker,
    selectedMarkerId,
    svg.height,
    svg.minX,
    svg.minY,
    svg.width,
  ])

  const clientToSvg = useCallback(
    (clientX, clientY) => {
      const rect = getStageRect()
      if (!rect) return null
      const current = viewRef.current
      return {
        x:
          svg.minX +
          (clientX - rect.left - current.x) / current.scale,
        y:
          svg.minY +
          (clientY - rect.top - current.y) / current.scale,
      }
    },
    [getStageRect, svg.minX, svg.minY],
  )

  const svgToStage = useCallback(
    (x, y) => ({
      x: view.x + (x - svg.minX) * view.scale,
      y: view.y + (y - svg.minY) * view.scale,
    }),
    [svg.minX, svg.minY, view],
  )

  const hitMarker = useCallback(
    (clientX, clientY) => {
      const rect = getStageRect()
      if (!rect) return null
      const pointX = clientX - rect.left
      const pointY = clientY - rect.top

      for (let index = markers.length - 1; index >= 0; index -= 1) {
        const marker = markers[index]
        const position = svgToStage(marker.x, marker.y)
        if (Math.hypot(position.x - pointX, position.y - pointY) <= 12) {
          return marker
        }
      }

      return null
    },
    [getStageRect, markers, svgToStage],
  )

  const updateCursor = (event) => {
    const rect = getStageRect()
    if (!rect) return
    setCursor({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    updateCursor(event)

    const hit = hitMarker(event.clientX, event.clientY)
    const currentView = viewRef.current
    const marker = hit ? markers.find((item) => item.id === hit.id) : null

    dragRef.current = {
      mode: hit ? 'marker' : 'click',
      markerId: hit?.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startView: currentView,
      startMarker: marker ? { x: marker.x, y: marker.y } : null,
      moved: false,
    }

    if (hit) onSelectMarker(hit.id)
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Synthetic pointer events and older browsers may not support capture.
    }
  }

  const handlePointerMove = (event) => {
    updateCursor(event)
    const drag = dragRef.current
    if (!drag) return

    const deltaX = event.clientX - drag.startClientX
    const deltaY = event.clientY - drag.startClientY
    if (Math.hypot(deltaX, deltaY) > 3) drag.moved = true

    if (drag.mode === 'marker' && drag.moved) {
      const point = clientToSvg(event.clientX, event.clientY)
      if (point) {
        onMoveMarker(
          drag.markerId,
          clamp(point.x, svg.minX, svg.minX + svg.width),
          clamp(point.y, svg.minY, svg.minY + svg.height),
        )
      }
      return
    }

    if (drag.mode === 'click' && drag.moved && (event.buttons & 1)) {
      drag.mode = 'pan'
      setPanning(true)
    }

    if (drag.mode === 'pan') {
      commitView({
        scale: drag.startView.scale,
        x: drag.startView.x + deltaX,
        y: drag.startView.y + deltaY,
      })
    }
  }

  const finishPointer = (event) => {
    const drag = dragRef.current
    dragRef.current = null
    setPanning(false)

    if (!drag) return
    if (drag.mode === 'click' && !drag.moved) {
      const point = clientToSvg(event.clientX, event.clientY)
      if (
        point &&
        point.x >= svg.minX &&
        point.x <= svg.minX + svg.width &&
        point.y >= svg.minY &&
        point.y <= svg.minY + svg.height
      ) {
        onAddMarker(point.x, point.y)
      }
    }
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    const hit = hitMarker(event.clientX, event.clientY)
    if (hit) onDeleteMarker(hit.id)
  }

  const markerPositions = markers.map((marker) => ({
    marker,
    position: svgToStage(marker.x, marker.y),
  }))

  const loupe = cursor ? (() => {
    const localX = (cursor.x - view.x) / view.scale
    const localY = (cursor.y - view.y) / view.scale
    let left = cursor.x + 20
    let top = cursor.y + 20

    if (left + LOUPE_SIZE > stageSize.width) left = cursor.x - LOUPE_SIZE - 20
    if (top + LOUPE_SIZE > stageSize.height) top = cursor.y - LOUPE_SIZE - 20

    return {
      left: Math.max(0, left),
      top: Math.max(0, top),
      translateX: LOUPE_SIZE / 2 - localX * LOUPE_ZOOM,
      translateY: LOUPE_SIZE / 2 - localY * LOUPE_ZOOM,
      svgX: svg.minX + localX,
      svgY: svg.minY + localY,
    }
  })() : null

  return (
    <section
      ref={stageRef}
      className={`stage${panning ? ' panning' : ''}`}
      aria-label="SVG marker canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={() => {
        dragRef.current = null
        setPanning(false)
      }}
      onPointerLeave={() => {
        if (!dragRef.current) setCursor(null)
      }}
      onPointerEnter={() => {
        // The next pointermove sets the exact cursor position.
      }}
      onContextMenu={handleContextMenu}
    >
      <div
        className="world"
        style={{
          width: `${svg.width}px`,
          height: `${svg.height}px`,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <div
          className="art"
          style={{ width: `${svg.width}px`, height: `${svg.height}px` }}
          dangerouslySetInnerHTML={{ __html: svg.markup }}
        />
        {ghostUrl && (
          <img
            className="ghost"
            src={ghostUrl}
            alt={ghostName ? `Reference image: ${ghostName}` : 'Reference image'}
            style={{
              width: `${svg.width}px`,
              height: `${svg.height}px`,
              opacity: ghostOpacity / 100,
            }}
          />
        )}
      </div>

      <div className="markers">
        {markerPositions.map(({ marker, position }, index) => {
          const selected = marker.id === selectedMarkerId
          const diameter = Math.max(6, marker.r * view.scale * 2)

          return (
            <div
              className={`marker${selected ? ' selected' : ''}`}
              key={marker.id}
              style={{ left: `${position.x}px`, top: `${position.y}px` }}
            >
              {showRanges && (
                <span
                  className="marker-ring"
                  style={{ width: `${diameter}px`, height: `${diameter}px` }}
                />
              )}
              <span className="marker-dot" />
              <span className="marker-number">{index + 1}</span>
            </div>
          )
        })}
      </div>

      {loupeEnabled && loupe && (
        <div
          className="loupe"
          style={{
            left: `${loupe.left}px`,
            top: `${loupe.top}px`,
            width: `${LOUPE_SIZE}px`,
            height: `${LOUPE_SIZE}px`,
          }}
        >
          <div
            className="loupe-content"
            style={{
              width: `${svg.width}px`,
              height: `${svg.height}px`,
              transform: `translate(${loupe.translateX}px, ${loupe.translateY}px) scale(${LOUPE_ZOOM})`,
            }}
            dangerouslySetInnerHTML={{ __html: svg.markup }}
          />
          <span className="crosshair crosshair-horizontal" />
          <span className="crosshair crosshair-vertical" />
          <span className="loupe-label">
            x={loupe.svgX.toFixed(1)} y={loupe.svgY.toFixed(1)}
          </span>
        </div>
      )}

      <div className="hud">
        zoom {Math.round(view.scale * 100)}% · {markers.length} markers
      </div>
      <div className="canvas-hint">
        Scroll to zoom · Drag empty space to pan · Click to mark · Right-click to delete
      </div>
      {dropVisible && <div className="drop-overlay">Drop to load file</div>}
    </section>
  )
})

export default MarkerCanvas
