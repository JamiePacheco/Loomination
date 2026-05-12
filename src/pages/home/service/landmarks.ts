// src/service/landmarks.ts

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

export type Landmark = {
  x: number;
  y: number;
  z: number;
};

export type AnchorPoint = {
  x: number;
  y: number;
};

export type LandmarkContour = AnchorPoint[];

export type FaceLandmarkResult = {
  landmarks: Landmark[];
  imageWidth: number;
  imageHeight: number;
};

export type LoomisAnchors = {
  // Eyes
  leftEye: AnchorPoint;
  rightEye: AnchorPoint;
  eyeMid: AnchorPoint;

  // Brows
  leftBrowInner: AnchorPoint;
  leftBrowMid: AnchorPoint;
  leftBrowOuter: AnchorPoint;

  rightBrowInner: AnchorPoint;
  rightBrowMid: AnchorPoint;
  rightBrowOuter: AnchorPoint;

  browMid: AnchorPoint;

  // Forehead / skull
  forehead: AnchorPoint;

  // Nose / mouth / chin
  noseBridge: AnchorPoint;
  noseTip: AnchorPoint;
  noseBase: AnchorPoint;

  leftNoseSide: AnchorPoint;
  rightNoseSide: AnchorPoint;

  upperLip: AnchorPoint;
  lowerLip: AnchorPoint;
  mouthCenter: AnchorPoint;

  chin: AnchorPoint;

  // Side plane / jaw anchors
  leftTemple: AnchorPoint;
  rightTemple: AnchorPoint;

  leftJaw: AnchorPoint;
  rightJaw: AnchorPoint;

  leftCheek: AnchorPoint;
  rightCheek: AnchorPoint;

  leftCheekLower: AnchorPoint;
  leftCheekMid: AnchorPoint;
  leftCheekUpper: AnchorPoint;

  rightCheekLower: AnchorPoint;
  rightCheekMid: AnchorPoint;
  rightCheekUpper: AnchorPoint;

  // Named contour groups
  outerContour: {
    left: LandmarkContour;
    right: LandmarkContour;
    full: LandmarkContour;
  };

  jawContour: {
    left: LandmarkContour;
    right: LandmarkContour;
    full: LandmarkContour;
  };

  cheekContour: {
    left: LandmarkContour;
    right: LandmarkContour;
  };

  // Backwards compatibility with older code
  nose: AnchorPoint;
};

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

export async function initLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarkerPromise) return faceLandmarkerPromise;

  faceLandmarkerPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  })();

  return faceLandmarkerPromise;
}

export async function getLandmarksFromImage(
  image: HTMLImageElement
): Promise<FaceLandmarkResult | null> {
  const landmarker = await initLandmarker();

  const result = landmarker.detect(image);

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  return {
    landmarks: result.faceLandmarks[0],
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
  };
}

function pt(landmarks: Landmark[], id: number): AnchorPoint {
  return {
    x: landmarks[id].x,
    y: landmarks[id].y,
  };
}

function pts(landmarks: Landmark[], ids: number[]): AnchorPoint[] {
  return ids.map((id) => pt(landmarks, id));
}

function midpoint(a: AnchorPoint, b: AnchorPoint): AnchorPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * MediaPipe face oval / contour landmark groups.
 *
 * Left/right are image/MediaPipe landmark sides.
 * Each side starts at chin and travels upward toward forehead.
 */
const LEFT_OUTER_CONTOUR_IDS = [
  152, // chin
  148,
  176,
  149,
  150,
  136,
  172,
  58,
  132,
  93,
  234,
  127,
  162,
  21,
  54,
  103,
  67,
  109,
  10, // forehead
];

const RIGHT_OUTER_CONTOUR_IDS = [
  152, // chin
  377,
  400,
  378,
  379,
  365,
  397,
  288,
  361,
  323,
  454,
  356,
  389,
  251,
  284,
  332,
  297,
  338,
  10, // forehead
];

const LEFT_JAW_CONTOUR_IDS = [
  152,
  148,
  176,
  149,
  150,
  136,
  172,
];

const RIGHT_JAW_CONTOUR_IDS = [
  152,
  377,
  400,
  378,
  379,
  365,
  397,
];

const LEFT_CHEEK_CONTOUR_IDS = [
  172,
  58,
  132,
  93,
  234,
];

const RIGHT_CHEEK_CONTOUR_IDS = [
  397,
  288,
  361,
  323,
  454,
];

export function getAnchors(landmarks: Landmark[]): LoomisAnchors {
  const leftEye = pt(landmarks, 33);
  const rightEye = pt(landmarks, 263);
  const eyeMid = midpoint(leftEye, rightEye);

  const leftBrowOuter = pt(landmarks, 70);
  const leftBrowMid = pt(landmarks, 105);
  const leftBrowInner = pt(landmarks, 107);

  const rightBrowInner = pt(landmarks, 336);
  const rightBrowMid = pt(landmarks, 334);
  const rightBrowOuter = pt(landmarks, 300);

  const browMid = midpoint(leftBrowMid, rightBrowMid);

  const forehead = pt(landmarks, 10);

  const noseBridge = pt(landmarks, 6);
  const noseTip = pt(landmarks, 1);
  const noseBase = pt(landmarks, 2);

  const leftNoseSide = pt(landmarks, 98);
  const rightNoseSide = pt(landmarks, 327);

  const upperLip = pt(landmarks, 13);
  const lowerLip = pt(landmarks, 14);
  const mouthCenter = midpoint(upperLip, lowerLip);

  const chin = pt(landmarks, 152);

  const leftTemple = pt(landmarks, 234);
  const rightTemple = pt(landmarks, 454);

  const leftJaw = pt(landmarks, 172);
  const rightJaw = pt(landmarks, 397);

  const leftCheek = pt(landmarks, 132);
  const rightCheek = pt(landmarks, 361);

  const leftCheekLower = pt(landmarks, 187);
  const leftCheekMid = pt(landmarks, 117);
  const leftCheekUpper = pt(landmarks, 111);

  const rightCheekLower = pt(landmarks, 411);
  const rightCheekMid = pt(landmarks, 346);
  const rightCheekUpper = pt(landmarks, 340);

  const leftOuterContour = pts(landmarks, LEFT_OUTER_CONTOUR_IDS);
  const rightOuterContour = pts(landmarks, RIGHT_OUTER_CONTOUR_IDS);

  const leftJawContour = pts(landmarks, LEFT_JAW_CONTOUR_IDS);
  const rightJawContour = pts(landmarks, RIGHT_JAW_CONTOUR_IDS);

  const leftCheekContour = pts(landmarks, LEFT_CHEEK_CONTOUR_IDS);
  const rightCheekContour = pts(landmarks, RIGHT_CHEEK_CONTOUR_IDS);

  return {
    leftEye,
    rightEye,
    eyeMid,

    leftBrowInner,
    leftBrowMid,
    leftBrowOuter,

    rightBrowInner,
    rightBrowMid,
    rightBrowOuter,

    browMid,

    forehead,

    noseBridge,
    noseTip,
    noseBase,

    leftNoseSide,
    rightNoseSide,

    upperLip,
    lowerLip,
    mouthCenter,

    chin,

    leftTemple,
    rightTemple,

    leftJaw,
    rightJaw,

    leftCheek,
    rightCheek,

    leftCheekLower,
    leftCheekMid,
    leftCheekUpper,

    rightCheekLower,
    rightCheekMid,
    rightCheekUpper,

    outerContour: {
      left: leftOuterContour,
      right: rightOuterContour,
      full: [
        ...leftOuterContour,
        ...rightOuterContour.slice(1),
      ],
    },

    jawContour: {
      left: leftJawContour,
      right: rightJawContour,
      full: [
        ...leftJawContour,
        ...rightJawContour.slice(1),
      ],
    },

    cheekContour: {
      left: leftCheekContour,
      right: rightCheekContour,
    },

    // Compatibility with older geometry code
    nose: noseTip,
  };
}