// src/service/loomisGeometry.ts

import type {
  AnchorPoint,
  LoomisAnchors,
} from "./landmarks";

export type LoomisSphere = {
  center: AnchorPoint;
  rx: number;
  ry: number;
  rotationDeg: number;
};

export type LoomisSidePlane = {
  center: AnchorPoint;
  rx: number;
  ry: number;
  rotationDeg: number;
  visible: boolean;
  side: "left" | "right";
};

export type LoomisBrowLine = {
  start: AnchorPoint;
  control: AnchorPoint;
  end: AnchorPoint;
  visible: boolean;
};

export type LoomisContourFrame = {
  points: AnchorPoint[];
  visible: boolean;
};

export type LoomisProfileContourFrame = {
  points: AnchorPoint[];
  visible: boolean;
};

function distance(a: AnchorPoint, b: AnchorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeVector(x: number, y: number) {
  const len = Math.hypot(x, y) || 1;

  return {
    x: x / len,
    y: y / len,
  };
}

function getYaw(anchors: LoomisAnchors): number {
  const eyeToChin = distance(anchors.eyeMid, anchors.chin);

  const rawYaw =
    (anchors.noseTip.x - anchors.eyeMid.x) /
    Math.max(eyeToChin * 0.45, 0.001);

  return Math.max(-1, Math.min(1, rawYaw));
}

/**
 * For current image coordinate system:
 * yaw < 0 means nose is left of eyeMid, so use left contour.
 * yaw > 0 means nose is right of eyeMid, so use right contour.
 */
function getFaceContourSide(
  anchors: LoomisAnchors
): "left" | "right" {
  const yaw = getYaw(anchors);
  return yaw < 0 ? "left" : "right";
}

/**
 * For the side plane / rear skull side:
 * this is the opposite semantic side from the visible face/front contour.
 */
function getBackSide(
  anchors: LoomisAnchors
): "left" | "right" {
  const yaw = getYaw(anchors);
  return yaw < 0 ? "right" : "left";
}

export function generateLoomisSphere(
  anchors: LoomisAnchors
): LoomisSphere {
  const eyeToChin = distance(anchors.eyeMid, anchors.chin);

  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  const eyeDx = anchors.rightEye.x - anchors.leftEye.x;
  const eyeDy = anchors.rightEye.y - anchors.leftEye.y;
  const rotationDeg = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);

  const eyeAxis = normalizeVector(eyeDx, eyeDy);

  let axisUp = normalizeVector(-eyeDy, eyeDx);

  if (axisUp.y > 0) {
    axisUp = {
      x: -axisUp.x,
      y: -axisUp.y,
    };
  }

  /**
   * Front view: stable simple cranium ball.
   */
  if (yawAbs < 0.14) {
    const center: AnchorPoint = {
      x: anchors.eyeMid.x,
      y: anchors.eyeMid.y - eyeToChin * 0.25,
    };

    const r = eyeToChin * 0.84;

    return {
      center,
      rx: r,
      ry: r,
      rotationDeg,
    };
  }

  /**
   * Turned/profile view:
   * fit from forehead/brow plane to inferred rear skull.
   */
  const backSide = getBackSide(anchors);
  const backSign = backSide === "right" ? 1 : -1;

  const backTemple =
    backSide === "right" ? anchors.rightTemple : anchors.leftTemple;

  const frontBoundary: AnchorPoint = {
    x:
      anchors.browMid.x * 0.65 +
      anchors.forehead.x * 0.35 -
      eyeAxis.x * backSign * eyeToChin * 0.1,

    y:
      anchors.browMid.y * 0.65 +
      anchors.forehead.y * 0.35 -
      eyeAxis.y * backSign * eyeToChin * 0.1,
  };

  const backBoundary: AnchorPoint = {
    x:
      backTemple.x +
      eyeAxis.x * backSign * eyeToChin * 0.18 +
      axisUp.x * eyeToChin * 0.08,

    y:
      backTemple.y +
      eyeAxis.y * backSign * eyeToChin * 0.18 +
      axisUp.y * eyeToChin * 0.08,
  };

  let center: AnchorPoint = {
    x: (frontBoundary.x + backBoundary.x) / 2,
    y: (frontBoundary.y + backBoundary.y) / 2,
  };

  center = {
    x: center.x,
    y: center.y + eyeToChin * 0.04 * yawAbs,
  };

  let r = Math.max(
    distance(center, frontBoundary),
    distance(center, backBoundary),
    distance(center, anchors.forehead) * 1.05
  );

  r *= 1.12;

  const rMin = eyeToChin * 0.82;
  const rMax = eyeToChin * (1.04 + yawAbs * 0.08);

  r = Math.max(rMin, Math.min(r, rMax));

  return {
    center,
    rx: r,
    ry: r,
    rotationDeg,
  };
}

export function generateLoomisSidePlane(
  anchors: LoomisAnchors,
  sphere: LoomisSphere
): LoomisSidePlane {
  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  const visible = yawAbs > 0.14;

  const side = getBackSide(anchors);
  const sideSign = side === "right" ? 1 : -1;

  const eyeDx = anchors.rightEye.x - anchors.leftEye.x;
  const eyeDy = anchors.rightEye.y - anchors.leftEye.y;
  const eyeAngleDeg = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);

  const eyeAxis = normalizeVector(eyeDx, eyeDy);

  const profileAmount = Math.min(
    Math.max((yawAbs - 0.25) / 0.55, 0),
    1
  );

  const sphereR = sphere.ry;

  const ry = sphereR * (0.76 - profileAmount * 0.09);
  const rx = ry * (0.62 + profileAmount * 0.34);

  const sideOffset = sphere.rx * (0.48 + profileAmount * 0.1);

  const center: AnchorPoint = {
    x: sphere.center.x + eyeAxis.x * sideOffset * sideSign,
    y: sphere.center.y + eyeAxis.y * sideOffset * sideSign,
  };

  return {
    center,
    rx,
    ry,
    rotationDeg: eyeAngleDeg,
    visible,
    side,
  };
}

export function generateLoomisBrowLine(
  anchors: LoomisAnchors,
  sphere: LoomisSphere,
  sidePlane: LoomisSidePlane | null
): LoomisBrowLine {
  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  const eyeDx = anchors.rightEye.x - anchors.leftEye.x;
  const eyeDy = anchors.rightEye.y - anchors.leftEye.y;

  const eyeAxis = normalizeVector(eyeDx, eyeDy);

  let axisUp = normalizeVector(-eyeDy, eyeDx);

  if (axisUp.y > 0) {
    axisUp = {
      x: -axisUp.x,
      y: -axisUp.y,
    };
  }

  const browCenter: AnchorPoint = {
    x: sphere.center.x * 0.5 + anchors.browMid.x * 0.5,
    y: sphere.center.y * 0.5 + anchors.browMid.y * 0.5,
  };

  /**
   * Front view: clean cross-line through brow/sphere center.
   */
  if (yawAbs < 0.16 || !sidePlane || !sidePlane.visible) {
    return {
      start: {
        x: browCenter.x - eyeAxis.x * sphere.rx * 0.82,
        y: browCenter.y - eyeAxis.y * sphere.rx * 0.82,
      },
      control: browCenter,
      end: {
        x: browCenter.x + eyeAxis.x * sphere.rx * 0.82,
        y: browCenter.y + eyeAxis.y * sphere.rx * 0.82,
      },
      visible: true,
    };
  }

  const faceSide = getFaceContourSide(anchors);

  const frontBrow =
    faceSide === "right" ? anchors.rightBrowMid : anchors.leftBrowMid;

  const start: AnchorPoint = {
    x: frontBrow.x * 0.72 + browCenter.x * 0.28,
    y: frontBrow.y * 0.72 + browCenter.y * 0.28,
  };

  const end: AnchorPoint = {
    x: sidePlane.center.x,
    y: sidePlane.center.y,
  };

  const wrapLift = sphere.ry * (0.04 + yawAbs * 0.035);

  const control: AnchorPoint = {
    x: browCenter.x + axisUp.x * wrapLift,
    y: browCenter.y + axisUp.y * wrapLift,
  };

  return {
    start,
    control,
    end,
    visible: true,
  };
}

export function generateJawContourFrame(
  anchors: LoomisAnchors,
  sphere: LoomisSphere,
  sidePlane: LoomisSidePlane | null
): LoomisContourFrame {
  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  const leftUpperAnchor: AnchorPoint = {
    x: anchors.leftTemple.x * 0.55 + anchors.leftJaw.x * 0.45,
    y: anchors.leftTemple.y * 0.68 + anchors.leftJaw.y * 0.32,
  };

  const rightUpperAnchor: AnchorPoint = {
    x: anchors.rightTemple.x * 0.55 + anchors.rightJaw.x * 0.45,
    y: anchors.rightTemple.y * 0.68 + anchors.rightJaw.y * 0.32,
  };

  /**
   * FRONT VIEW:
   * full jaw, rising up both sides toward the sphere.
   */
  if (yawAbs < 0.12) {
    const leftJawDown = anchors.jawContour.left.slice().reverse(); // upper -> chin
    const rightJawUp = anchors.jawContour.right.slice(1); // chin removed, then chin->upper on right

    return {
      points: [
        leftUpperAnchor,
        ...leftJawDown,
        ...rightJawUp,
        rightUpperAnchor,
      ],
      visible: true,
    };
  }

  /**
   * 3/4 + PROFILE:
   * only back/ear side jaw.
   */
  const backSide = getBackSide(anchors);

  const jawPoints =
    backSide === "left"
      ? anchors.jawContour.left
      : anchors.jawContour.right;

  const upperJaw =
    backSide === "left" ? anchors.leftJaw : anchors.rightJaw;

  const temple =
    backSide === "left" ? anchors.leftTemple : anchors.rightTemple;

  const upperAnchor: AnchorPoint =
    sidePlane && sidePlane.visible
      ? {
          x: sidePlane.center.x * 0.30 + temple.x * 0.38 + upperJaw.x * 0.32,
          y: sidePlane.center.y * 0.22 + temple.y * 0.48 + upperJaw.y * 0.30,
        }
      : {
          x: temple.x * 0.58 + upperJaw.x * 0.42,
          y: temple.y * 0.70 + upperJaw.y * 0.30,
        };

  const orderedJaw = jawPoints.slice().reverse(); // upper -> chin

  return {
    points: [upperAnchor, ...orderedJaw],
    visible: true,
  };
}


/**
 * Outer face/profile contour:
 * chin -> jaw -> cheek -> temple/side forehead -> top forehead.
 *
 * This intentionally uses the named outer contour groups from landmarks.ts.
 * No nose, no lips, no synthetic cheek pushing.
 */
export function generateDetailedProfileContourFrame(
  anchors: LoomisAnchors
): LoomisProfileContourFrame {
  const yaw = getYaw(anchors);
  const yawAbs = Math.abs(yaw);

  if (yawAbs < 0.06) {
    return {
      points: [],
      visible: false,
    };
  }

  const faceSide = getFaceContourSide(anchors);

  return {
    points:
      faceSide === "left"
        ? anchors.outerContour.left
        : anchors.outerContour.right,
    visible: true,
  };
}