// src/components/LoomisCanvas.tsx

import React, { useMemo, useRef, useState } from "react";

import {
  AnchorPoint,
  getAnchors,
  getLandmarksFromImage,
  Landmark,
  LoomisAnchors,
} from "../service/landmarks";

import {
  generateJawContourFrame,
  generateLoomisBrowLine,
  generateLoomisSidePlane,
  generateLoomisSphere,
} from "../service/loomisGeometry";

import {
  EdgeContourResult,
  generateEdgeProfileContour,
} from "../service/edgeContour";

// define saved image type

type SavedImage = {
  id: string;
  name: string;
  url: string;
  landmarks: Landmark[];
  anchors: LoomisAnchors | null;
  edgeContour: EdgeContourResult | null;
};

// define type for checkbox booleans

type GuideToggles = {
  landmarks: boolean;
  anchors: boolean;
  labels: boolean;
  sphere: boolean;
  sidePlane: boolean;
  browLine: boolean;
  jaw: boolean;
  edgeContour: boolean;
  debugLines: boolean;
};

 
// define abstracted point type
type ScreenPoint = {
  x: number;
  y: number;
};

// define primary colors
const PRIMARY = "#faebd7";
const SECONDARY = "#482700";
const PAPER = "#fff8ee";


// define constant that stores checkbox state
const defaultToggles: GuideToggles = {
  landmarks: false,
  anchors: true,
  labels: false,
  sphere: true,
  sidePlane: true,
  browLine: true,
  jaw: true,
  edgeContour: true,
  debugLines: true,
};

export default function LoomisCanvas() {

  // define component state
  const [images, setImages] = useState<SavedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [toggles, setToggles] = useState<GuideToggles>(defaultToggles);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDetectingEdge, setIsDetectingEdge] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // define refs for image and file
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // define the computed anchor, landmarks, and edge contour of the image
  const activeImage = images.find((img) => img.id === activeImageId) ?? null;
  const anchors = activeImage?.anchors ?? null;
  const landmarks = activeImage?.landmarks ?? [];
  const edgeContour = activeImage?.edgeContour ?? null;

  // generate the sphere
  const sphere = useMemo(() => {
    return anchors ? generateLoomisSphere(anchors) : null;
  }, [anchors]);

  // generate the slide plane
  const sidePlane = useMemo(() => {
    return anchors && sphere ? generateLoomisSidePlane(anchors, sphere) : null;
  }, [anchors, sphere]);

  // generate the brow line
  const browLine = useMemo(() => {
    return anchors && sphere
      ? generateLoomisBrowLine(anchors, sphere, sidePlane)
      : null;
  }, [anchors, sphere, sidePlane]);

  // generate the jaw contour
  const jawContour = useMemo(() => {
    return anchors && sphere
      ? generateJawContourFrame(anchors, sphere, sidePlane)
      : null;
  }, [anchors, sphere, sidePlane]);

  // helper function to map anchor point to specifc image point
  const toScreen = (p: AnchorPoint): ScreenPoint => ({
    x: p.x * dims.width,
    y: p.y * dims.height,
  });

  // update specifc in image memory
  const updateImageById = (id: string, patch: Partial<SavedImage>) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...patch } : img))
    );
  };

  // toggle specifc guideline on or off
  const toggleGuide = (key: keyof GuideToggles) => {
    setToggles((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // helper function to adding new image file to memory
  const addFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) return;

    const newImages: SavedImage[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      landmarks: [],
      anchors: null,
      edgeContour: null,
    }));

    setImages((prev) => [...prev, ...newImages]);
    setActiveImageId(newImages[0].id);
    setDims({ width: 0, height: 0 });
  };

  // handle file upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  // allow for files drag and drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  // function for manual edge detection (useful for rerunning if needed)
  const detectEdgeForImage = async (
    imageElement: HTMLImageElement,
    imageId: string,
    anchorResult: LoomisAnchors
  ) => {
    setIsDetectingEdge(true);

    try {
      const edgeResult = await generateEdgeProfileContour(
        imageElement,
        anchorResult
      );

      updateImageById(imageId, {
        edgeContour: edgeResult,
      });
    } catch (err) {
      console.error("Edge contour failed:", err);

      updateImageById(imageId, {
        edgeContour: null,
      });
    } finally {
      setIsDetectingEdge(false);
    }
  };

  // function for hwen chaging image from saved images
  const handleImageLoad = async () => {
    if (!imgRef.current || !activeImage) return;

    const img = imgRef.current;
    const rect = img.getBoundingClientRect();

    // set image dimensions
    setDims({
      width: rect.width,
      height: rect.height,
    });

    
    //If already analyzed, do not rerun
    if (activeImage.anchors && activeImage.landmarks.length > 0) {
      return;
    }

    setIsAnalyzing(true);

    // get specifc landmarks if not generated
    try {
      const result = await getLandmarksFromImage(img);

      if (!result) {
        console.warn("No face detected");

        updateImageById(activeImage.id, {
          landmarks: [],
          anchors: null,
          edgeContour: null,
        });

        return;
      }

      const anchorResult = getAnchors(result.landmarks);

      updateImageById(activeImage.id, {
        landmarks: result.landmarks,
        anchors: anchorResult,
        edgeContour: null,
      });

      /**
       * Automatically run edge detection immediately after MediaPipe.
       * Delayed one tick so the UI can update first.
       */
      setTimeout(() => {
        detectEdgeForImage(img, activeImage.id, anchorResult);
      }, 0);
    } catch (err) {
      console.error("MediaPipe analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // used to remove image from memeory
  const clearCurrentImage = () => {
    if (!activeImageId) return;

    const current = images.find((img) => img.id === activeImageId);
    if (current) URL.revokeObjectURL(current.url);

    const remaining = images.filter((img) => img.id !== activeImageId);

    setImages(remaining);
    setActiveImageId(remaining[0]?.id ?? null);
    setDims({ width: 0, height: 0 });
  };


  // use to remove all images from memories
  const clearAllImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setActiveImageId(null);
    setDims({ width: 0, height: 0 });
  };


  // generate a string indicating the coordinate path for some points
  // used in svg generation
  function pointsToPath(points: AnchorPoint[]): string {
    const screenPoints = points.map(toScreen);

    return screenPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }

  // generate label render
  function renderLabel(text: string, point: AnchorPoint, dx = 6, dy = -6) {
    if (!toggles.labels) return null;

    const p = toScreen(point);

    return (
      <text
        x={p.x + dx}
        y={p.y + dy}
        fontSize={12}
        fill={PRIMARY}
        stroke={SECONDARY}
        strokeWidth={3}
        paintOrder="stroke"
      >
        {text}
      </text>
    );
  }

  // helps smooth edges 
  function bowPointsOutward(
    points: ScreenPoint[],
    cheek: ScreenPoint,
    strength = 0.18
  ): ScreenPoint[] {
    if (points.length < 3) return points;

    return points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return p;

      const t = i / (points.length - 1);
      const w = Math.sin(Math.PI * t) * strength;

      return {
        x: p.x * (1 - w) + cheek.x * w,
        y: p.y * (1 - w) + cheek.y * w,
      };
    });
  }

  // generate the list of points used to contour smooth path
  function pointsToSmoothPath(points: ScreenPoint[]): string {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  }

  // get the specifc contour path
  function getEdgeContourPathD(): string {
    if (!edgeContour || !edgeContour.visible || !anchors) return "";

    const rawPoints = edgeContour.points.map(toScreen);

    const faceSide = anchors.noseTip.x < anchors.eyeMid.x ? "left" : "right";

    const cheekAnchor = toScreen(
      faceSide === "left" ? anchors.leftCheekMid : anchors.rightCheekMid
    );

    const bowedPoints = bowPointsOutward(rawPoints, cheekAnchor, 0.18);

    return pointsToSmoothPath(bowedPoints);
  }

  // define button styles
  const buttonStyle: React.CSSProperties = {
    background: PRIMARY,
    color: SECONDARY,
    border: `2px solid ${SECONDARY}`,
    borderRadius: "10px",
    padding: "9px 12px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "2px 2px 0 rgba(72, 39, 0, 0.25)",
  };

  // define disabled button styles
  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.45,
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "90%",
        color: SECONDARY,
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: "28px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1320px",
          margin: "0 auto",
          border: `3px solid ${SECONDARY}`,
          borderRadius: "22px",
          background: PAPER,
          boxShadow: "10px 10px 0 rgba(72, 39, 0, 0.22)",
          padding: "24px",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "20px",
            alignItems: "flex-end",
            marginBottom: "22px",
            borderBottom: `2px solid ${SECONDARY}`,
            paddingBottom: "14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "15px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Strathmore-style sketch
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "44px",
                lineHeight: 1,
                fontWeight: 500,
              }}
            >
              Loominate
            </h1>
          </div>

          <div
            style={{
              fontSize: "14px",
              maxWidth: "360px",
              lineHeight: 1.35,
              textAlign: "right",
            }}
          >
            Upload portraits and compare generated Loomis construction guides.
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px minmax(0, 760px) 240px",
            gap: "20px",
            alignItems: "start",
            justifyContent: "center",
          }}
        >
          {/* Left controls */}
          <aside
            style={{
              border: `2px solid ${SECONDARY}`,
              borderRadius: "16px",
              background: PRIMARY,
              padding: "14px",
            }}
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${SECONDARY}`,
                borderRadius: "14px",
                padding: "20px 14px",
                textAlign: "center",
                background: isDragging ? "#f3d9b7" : PAPER,
                cursor: "pointer",
                marginBottom: "14px",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleUpload}
                style={{ display: "none" }}
              />

              <div
                style={{
                  fontSize: "32px",
                  lineHeight: 1,
                  marginBottom: "8px",
                }}
              >
                ✎
              </div>

              <div style={{ fontWeight: 700, fontSize: "15px" }}>
                Drop images here
              </div>

              <div style={{ fontSize: "13px", marginTop: "4px" }}>
                or click to browse
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (imgRef.current && anchors && activeImage) {
                  detectEdgeForImage(imgRef.current, activeImage.id, anchors);
                }
              }}
              disabled={!anchors || isDetectingEdge}
              style={
                !anchors || isDetectingEdge ? disabledButtonStyle : buttonStyle
              }
            >
              {isDetectingEdge ? "Detecting..." : "Redetect edge"}
            </button>

            <div style={{ height: "10px" }} />

            <button
              type="button"
              onClick={clearCurrentImage}
              disabled={!activeImage}
              style={!activeImage ? disabledButtonStyle : buttonStyle}
            >
              Remove current
            </button>

            <div style={{ height: "10px" }} />

            <button
              type="button"
              onClick={clearAllImages}
              disabled={images.length === 0}
              style={images.length === 0 ? disabledButtonStyle : buttonStyle}
            >
              Clear all
            </button>

            <h3
              style={{
                fontSize: "18px",
                margin: "20px 0 10px",
                borderBottom: `1px solid ${SECONDARY}`,
                paddingBottom: "6px",
              }}
            >
              Guide layers
            </h3>

            <div style={{ display: "grid", gap: "7px" }}>
              {Object.keys(toggles).map((key) => {
                const toggleKey = key as keyof GuideToggles;

                return (
                  <label
                    key={toggleKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "15px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={toggles[toggleKey]}
                      onChange={() => toggleGuide(toggleKey)}
                      style={{ accentColor: SECONDARY }}
                    />
                    {toggleKey}
                  </label>
                );
              })}
            </div>
          </aside>

          {/* Center image */}
          <main
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            {!activeImage && (
              <div
                style={{
                  width: "720px",
                  height: "720px",
                  border: `2px dashed ${SECONDARY}`,
                  borderRadius: "18px",
                  display: "grid",
                  placeItems: "center",
                  background: "#fffaf2",
                  textAlign: "center",
                  padding: "24px",
                  boxSizing: "border-box",
                }}
              >
                <div>
                  <div style={{ fontSize: "52px" }}>Sketch</div>
                  <p style={{ fontSize: "18px", maxWidth: "420px" }}>
                    Upload a portrait to generate Loomis construction guides.
                  </p>
                </div>
              </div>
            )}

            {activeImage && (
              <div>
                {(isAnalyzing || isDetectingEdge) && (
                  <div
                    style={{
                      marginBottom: "10px",
                      fontWeight: 700,
                      fontSize: "15px",
                    }}
                  >
                    {isAnalyzing
                      ? "Analyzing face..."
                      : "Detecting edge contour..."}
                  </div>
                )}

                <div
                  style={{
                    position: "relative",
                    width: "720px",
                    height: "720px",
                    background: "#fffaf2",
                    border: `3px solid ${SECONDARY}`,
                    borderRadius: "18px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    ref={imgRef}
                    src={activeImage.url}
                    alt={activeImage.name}
                    onLoad={handleImageLoad}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      width: "auto",
                      height: "auto",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />

                  {landmarks.length > 0 && dims.width > 0 && dims.height > 0 && (
                    <svg
                      width={dims.width}
                      height={dims.height}
                      style={{
                        position: "absolute",
                        pointerEvents: "none",
                      }}
                    >
                      {toggles.landmarks &&
                        landmarks.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x * dims.width}
                            cy={p.y * dims.height}
                            r={1.8}
                            fill="red"
                            opacity={0.55}
                          />
                        ))}

                      {anchors && toggles.anchors && (
                        <g>
                          <circle
                            cx={toScreen(anchors.eyeMid).x}
                            cy={toScreen(anchors.eyeMid).y}
                            r={5}
                            fill="blue"
                          />
                          {renderLabel("eyeMid", anchors.eyeMid)}

                          <circle
                            cx={toScreen(anchors.forehead).x}
                            cy={toScreen(anchors.forehead).y}
                            r={5}
                            fill="yellow"
                          />
                          {renderLabel("forehead", anchors.forehead)}

                          <circle
                            cx={toScreen(anchors.chin).x}
                            cy={toScreen(anchors.chin).y}
                            r={5}
                            fill="green"
                          />
                          {renderLabel("chin", anchors.chin)}

                          <circle
                            cx={toScreen(anchors.noseTip).x}
                            cy={toScreen(anchors.noseTip).y}
                            r={5}
                            fill="red"
                          />
                          {renderLabel("nose", anchors.noseTip)}
                        </g>
                      )}

                      {anchors && toggles.debugLines && (
                        <g>
                          <line
                            x1={toScreen(anchors.leftEye).x}
                            y1={toScreen(anchors.leftEye).y}
                            x2={toScreen(anchors.rightEye).x}
                            y2={toScreen(anchors.rightEye).y}
                            stroke="blue"
                            strokeWidth={2}
                          />

                          <line
                            x1={toScreen(anchors.forehead).x}
                            y1={toScreen(anchors.forehead).y}
                            x2={toScreen(anchors.chin).x}
                            y2={toScreen(anchors.chin).y}
                            stroke="green"
                            strokeWidth={2}
                          />

                        </g>
                      )}

                      {sphere &&
                        toggles.sphere &&
                        (() => {
                          const center = toScreen(sphere.center);
                          const radiusScale = Math.min(dims.width, dims.height);

                          return (
                            <ellipse
                              cx={center.x}
                              cy={center.y}
                              rx={sphere.rx * radiusScale}
                              ry={sphere.ry * radiusScale}
                              transform={`rotate(${sphere.rotationDeg} ${center.x} ${center.y})`}
                              fill="none"
                              stroke="orange"
                              strokeWidth={3}
                            />
                          );
                        })()}

                      {sphere &&
                        browLine &&
                        browLine.visible &&
                        toggles.browLine &&
                        (() => {
                          const sphereCenter = toScreen(sphere.center);

                          const start = toScreen(browLine.start);
                          const control = toScreen(browLine.control);
                          const end = toScreen(browLine.end);

                          const radiusScale = Math.min(dims.width, dims.height);

                          const sphereRx = sphere.rx * radiusScale;
                          const sphereRy = sphere.ry * radiusScale;

                          const clipId = `loomis-browline-clip-${activeImage.id}`;

                          const d = `
                            M ${start.x} ${start.y}
                            Q ${control.x} ${control.y}
                              ${end.x} ${end.y}
                          `;

                          return (
                            <g>
                              <defs>
                                <clipPath id={clipId}>
                                  <ellipse
                                    cx={sphereCenter.x}
                                    cy={sphereCenter.y}
                                    rx={sphereRx}
                                    ry={sphereRy}
                                    transform={`rotate(${sphere.rotationDeg} ${sphereCenter.x} ${sphereCenter.y})`}
                                  />
                                </clipPath>
                              </defs>

                              <path
                                d={d}
                                clipPath={`url(#${clipId})`}
                                fill="none"
                                stroke="deepskyblue"
                                strokeWidth={2}
                                opacity={0.95}
                              />
                            </g>
                          );
                        })()}

                      {sphere &&
                        sidePlane &&
                        sidePlane.visible &&
                        toggles.sidePlane &&
                        (() => {
                          const sphereCenter = toScreen(sphere.center);
                          const sideCenter = toScreen(sidePlane.center);

                          const radiusScale = Math.min(dims.width, dims.height);

                          const sphereRx = sphere.rx * radiusScale;
                          const sphereRy = sphere.ry * radiusScale;

                          const rx = sidePlane.rx * radiusScale;
                          const ry = sidePlane.ry * radiusScale;

                          const angleRad = (sidePlane.rotationDeg * Math.PI) / 180;

                          const dx = Math.cos(angleRad + Math.PI / 2) * ry;
                          const dy = Math.sin(angleRad + Math.PI / 2) * ry;

                          const clipId = `loomis-sideplane-clip-${activeImage.id}`;

                          return (
                            <g>
                              <defs>
                                <clipPath id={clipId}>
                                  <ellipse
                                    cx={sphereCenter.x}
                                    cy={sphereCenter.y}
                                    rx={sphereRx}
                                    ry={sphereRy}
                                    transform={`rotate(${sphere.rotationDeg} ${sphereCenter.x} ${sphereCenter.y})`}
                                  />
                                </clipPath>
                              </defs>

                              <g clipPath={`url(#${clipId})`}>
                                <ellipse
                                  cx={sideCenter.x}
                                  cy={sideCenter.y}
                                  rx={rx}
                                  ry={ry}
                                  transform={`rotate(${sidePlane.rotationDeg} ${sideCenter.x} ${sideCenter.y})`}
                                  fill="none"
                                  stroke="deepskyblue"
                                  strokeWidth={2}
                                />

                                <line
                                  x1={sideCenter.x - dx}
                                  y1={sideCenter.y - dy}
                                  x2={sideCenter.x + dx}
                                  y2={sideCenter.y + dy}
                                  stroke="deepskyblue"
                                  strokeWidth={2}
                                  opacity={0.9}
                                />
                              </g>
                            </g>
                          );
                        })()}

                      {jawContour &&
                        jawContour.visible &&
                        toggles.jaw &&
                        jawContour.points.length > 1 && (
                          <path
                            d={pointsToPath(jawContour.points)}
                            fill="none"
                            stroke="lime"
                            strokeWidth={3}
                            opacity={0.95}
                          />
                        )}

                      {edgeContour &&
                        edgeContour.visible &&
                        toggles.edgeContour &&
                        edgeContour.points.length > 1 && (
                          <path
                            d={getEdgeContourPathD()}
                            fill="none"
                            stroke="magenta"
                            strokeWidth={3}
                            opacity={0.95}
                          />
                        )}
                    </svg>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Right saved image rail */}
          <aside
            style={{
              border: `2px solid ${SECONDARY}`,
              borderRadius: "16px",
              background: PRIMARY,
              padding: "14px",
              minHeight: "320px",
              width: "225px"
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: "18px",
                borderBottom: `1px solid ${SECONDARY}`,
                paddingBottom: "6px",
              }}
            >
              Saved Images
            </h3>

            <div
              style={{
                display: "grid",
                gap: "10px",
                maxHeight: "640px",
                overflowY: "hidden",
                overflowX: "hidden",
                paddingRight: "4px",
              }}
            >
              {images.length === 0 && (
                <p style={{ margin: 0, fontSize: "14px" }}>
                  Uploaded images will appear here.
                </p>
              )}

              {images.map((img) => {
                const isActive = img.id === activeImageId;

                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      setActiveImageId(img.id);
                      setDims({ width: 0, height: 0 });
                    }}
                    style={{
                      border: isActive
                        ? `3px solid ${SECONDARY}`
                        : `1px solid ${SECONDARY}`,
                      background: isActive ? "#f3d9b7" : PAPER,
                      color: SECONDARY,
                      maxWidth: "70%",
                      borderRadius: "12px",
                      padding: "8px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "Georgia, 'Times New Roman', serif",
                    }}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      style={{
                        width: "50%",
                        height: "112px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: `1px solid ${SECONDARY}`,
                        marginBottom: "6px",
                      }}
                    />

                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {img.name}
                    </div>

                    <div style={{ fontSize: "12px", marginTop: "2px" }}>
                      {img.anchors ? "analyzed" : "not analyzed"}
                      {img.edgeContour ? " · edge" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}