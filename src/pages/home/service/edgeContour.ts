// src/service/edgeContour.ts

import type { AnchorPoint, LoomisAnchors } from "./landmarks";

export type EdgeContourResult = {
  points: AnchorPoint[];
  visible: boolean;
};

function distance(a: AnchorPoint, b: AnchorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getYaw(anchors: LoomisAnchors): number {
  const eyeToChin = distance(anchors.eyeMid, anchors.chin);

  const rawYaw =
    (anchors.noseTip.x - anchors.eyeMid.x) /
    Math.max(eyeToChin * 0.45, 0.001);

  return Math.max(-1, Math.min(1, rawYaw));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPx(p: AnchorPoint, width: number, height: number) {
  return {
    x: p.x * width,
    y: p.y * height,
  };
}

function toNorm(p: { x: number; y: number }, width: number, height: number) {
  return {
    x: p.x / width,
    y: p.y / height,
  };
}

function luminance(data: Uint8ClampedArray, index: number): number {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];

  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function smoothPoints(points: AnchorPoint[], passes = 2): AnchorPoint[] {
  let result = points;

  for (let pass = 0; pass < passes; pass++) {
    if (result.length < 3) return result;

    result = result.map((p, i) => {
      if (i === 0 || i === result.length - 1) return p;

      const prev = result[i - 1];
      const next = result[i + 1];

      return {
        x: (prev.x + p.x + next.x) / 3,
        y: (prev.y + p.y + next.y) / 3,
      };
    });
  }

  return result;
}

/**
 * Remove large jumps between neighboring edge points.
 * This helps reject sudden snaps to the nose, background, or hair.
 */
function removeOutliers(points: AnchorPoint[], maxJump: number): AnchorPoint[] {
  if (points.length < 3) return points;

  const filtered: AnchorPoint[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = filtered[filtered.length - 1];
    const current = points[i];

    const jump = distance(prev, current);

    if (jump <= maxJump) {
      filtered.push(current);
    }
  }

  filtered.push(points[points.length - 1]);

  return filtered;
}

/**
 * Lightweight cheek/face-edge detector.
 *
 * This intentionally does NOT detect the full face silhouette.
 * It uses:
 * - landmarks for top/bottom anchors
 * - image edges only for the cheek band
 *
 * Returned path:
 * forehead/brow anchor -> cheek edge points -> chin anchor
 */
export async function generateEdgeProfileContour(
  image: HTMLImageElement,
  anchors: LoomisAnchors
): Promise<EdgeContourResult> {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;

  if (!naturalWidth || !naturalHeight) {
    return {
      points: [],
      visible: false,
    };
  }

  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  /**
   * For near-front views, a side contour is usually not useful.
   */
  if (yawAbs < 0.06) {
    return {
      points: [],
      visible: false,
    };
  }

  /**
   * Downscale for speed.
   * Increase to 500 if you need more detail.
   */
  const MAX_SIZE = 420;

  const scale = Math.min(
    1,
    MAX_SIZE / Math.max(naturalWidth, naturalHeight)
  );

  const width = Math.round(naturalWidth * scale);
  const height = Math.round(naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    return {
      points: [],
      visible: false,
    };
  }

  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  /**
   * yaw < 0 means face/front side is toward image-left.
   * yaw > 0 means face/front side is toward image-right.
   */
  const faceSide: "left" | "right" = yaw < 0 ? "left" : "right";

  const browOuter =
    faceSide === "left" ? anchors.leftBrowOuter : anchors.rightBrowOuter;

  const cheekUpper =
    faceSide === "left" ? anchors.leftCheekUpper : anchors.rightCheekUpper;

  const cheekMid =
    faceSide === "left" ? anchors.leftCheekMid : anchors.rightCheekMid;

  const cheekLower =
    faceSide === "left" ? anchors.leftCheekLower : anchors.rightCheekLower;

  const jaw =
    faceSide === "left" ? anchors.leftJaw : anchors.rightJaw;

  const foreheadPx = toPx(anchors.forehead, width, height);
  const browPx = toPx(browOuter, width, height);
  const cheekUpperPx = toPx(cheekUpper, width, height);
  const cheekMidPx = toPx(cheekMid, width, height);
  const cheekLowerPx = toPx(cheekLower, width, height);
  const jawPx = toPx(jaw, width, height);
  const chinPx = toPx(anchors.chin, width, height);
  const eyeMidPx = toPx(anchors.eyeMid, width, height);
  const nosePx = toPx(anchors.noseTip, width, height);

  const faceHeight = Math.abs(chinPx.y - foreheadPx.y);

  /**
   * Fixed top and bottom anchors.
   * These keep the result from floating or missing the chin.
   */
  const topAnchor: AnchorPoint = {
    x: anchors.forehead.x * 0.6 + browOuter.x * 0.4,
    y: anchors.forehead.y * 0.6 + browOuter.y * 0.4,
  };

  const bottomAnchor: AnchorPoint = {
    x: anchors.chin.x,
    y: anchors.chin.y,
  };

  /**
   * Only scan the cheek/jaw band.
   * This avoids the nose ridge as much as possible.
   */
    const scanTop = clamp(
        Math.round((browPx.y + cheekUpperPx.y) / 2),
        1,
        height - 2
    );

    const scanBottom = clamp(
        Math.round(chinPx.y),
        1,
        height - 2
    );

  /**
   * Search range:
   * start outside the face and move inward.
   */
  const padding = faceHeight * 0.42;

  let xStart: number;
  let xEnd: number;
  let step: number;

  if (faceSide === "left") {
    xStart = clamp(
      Math.round(
        Math.min(
          foreheadPx.x,
          browPx.x,
          cheekUpperPx.x,
          cheekMidPx.x,
          cheekLowerPx.x,
          jawPx.x,
          chinPx.x
        ) - padding
      ),
      1,
      width - 2
    );

    /**
     * Do not search too far into the nose/center of the face.
     */
    xEnd = clamp(
      Math.round(Math.min(nosePx.x - faceHeight * 0.08, eyeMidPx.x)),
      1,
      width - 2
    );

    step = 1;
  } else {
    xStart = clamp(
      Math.round(
        Math.max(
          foreheadPx.x,
          browPx.x,
          cheekUpperPx.x,
          cheekMidPx.x,
          cheekLowerPx.x,
          jawPx.x,
          chinPx.x
        ) + padding
      ),
      1,
      width - 2
    );

    /**
     * Do not search too far into the nose/center of the face.
     */
    xEnd = clamp(
      Math.round(Math.max(nosePx.x + faceHeight * 0.08, eyeMidPx.x)),
      1,
      width - 2
    );

    step = -1;
  }

  const pixelPoints: { x: number; y: number }[] = [];

  /**
   * Larger yStep = faster and simpler.
   */
  const yStep = Math.max(5, Math.round(faceHeight / 34));

  let prevAcceptedX: number | null = null;

  const noseRejectMargin = faceHeight * 0.12;
for (let y = scanTop; y <= scanBottom; y += yStep) {
  let bestX: number | null = null;
  let bestScore = -Infinity;

  let rowXStart = xStart;
  let rowXEnd = xEnd;

  /**
   * After the first accepted point, only search near the previous point.
   * This prevents the path from suddenly jumping way outward or inward.
   */
  if (prevAcceptedX !== null) {
    const drift = Math.round(faceHeight * 0.10);

    if (faceSide === "left") {
      rowXStart = clamp(prevAcceptedX - drift, 1, width - 2);
      rowXEnd = clamp(prevAcceptedX + drift, 1, width - 2);
    } else {
      rowXStart = clamp(prevAcceptedX + drift, 1, width - 2);
      rowXEnd = clamp(prevAcceptedX - drift, 1, width - 2);
    }
  }

  for (
    let x = rowXStart;
    faceSide === "left" ? x <= rowXEnd : x >= rowXEnd;
    x += step
  ) {
    const leftX = clamp(x - 2, 0, width - 1);
    const rightX = clamp(x + 2, 0, width - 1);

    const leftIdx = (y * width + leftX) * 4;
    const rightIdx = (y * width + rightX) * 4;

    const leftLum = luminance(data, leftIdx);
    const rightLum = luminance(data, rightIdx);

    const contrast = Math.abs(rightLum - leftLum);

    const totalSearchDist = Math.max(1, Math.abs(rowXEnd - rowXStart));
    const distanceFromStart = Math.abs(x - rowXStart);
    const outsideBias =
      1 - Math.min(1, distanceFromStart / totalSearchDist);

    const tooCloseToNose =
      faceSide === "left"
        ? x > nosePx.x - noseRejectMargin
        : x < nosePx.x + noseRejectMargin;

    if (tooCloseToNose) continue;

    /**
     * Penalize candidates far from the previous row's accepted x.
     */
    const continuityPenalty =
      prevAcceptedX === null ? 0 : Math.abs(x - prevAcceptedX) * 0.9;

    const score =
      contrast +
      outsideBias * 20 -
      continuityPenalty;

    if (score > bestScore && contrast > 10) {
      bestScore = score;
      bestX = x;
    }
  }

    if (bestX !== null) {
        pixelPoints.push({ x: bestX, y });
        prevAcceptedX = bestX;
    }
    }

  /**
   * Convert detected cheek points to normalized coordinates.
   */
  let edgePoints = pixelPoints.map((p) => toNorm(p, width, height));

  /**
   * If edge detection failed, fall back to landmark cheek structure
   * instead of returning nothing.
   */
  if (edgePoints.length < 3) {
    const fallbackPoints = [
      topAnchor,
      cheekUpper,
      cheekMid,
      cheekLower,
      jaw,
      bottomAnchor,
    ];

    return {
      points: fallbackPoints,
      visible: true,
    };
  }

  /**
   * Remove sudden jumps and smooth the cheek band.
   */
    edgePoints = removeOutliers(edgePoints, 0.08);
    edgePoints = smoothPoints(edgePoints, 3);

  /**
   * Final hybrid path:
   * top anchor -> edge cheek points -> jaw/chin anchor.
   *
   * Include jaw before chin so the line turns into the jaw properly.
   */
    const resultPoints: AnchorPoint[] = [
        bottomAnchor,
        ...edgePoints.slice().reverse(),
        topAnchor,
    ];

  return {
    points: resultPoints,
    visible: true,
  };
}