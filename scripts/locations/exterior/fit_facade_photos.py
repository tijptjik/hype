"""Fit overlapping photographs to one facade plane without an AI service.

Run: python fit_facade_photos.py surface.json output-directory
The JSON contains reference (photo path), details (additional photo paths), size [w,h]
and corners (four normalized reference-photo points, clockwise from top left).
Supply an independent surface definition for each setback. Outputs are a candidate
texture and evidence for reviewing matches, uncovered areas and geometric outliers.
"""

import argparse
import hashlib
import json
from pathlib import Path

import cv2 as cv
import numpy as np
from PIL import Image, ImageOps


def load_photo(path):
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((4096, 4096), Image.Resampling.LANCZOS)
    return cv.cvtColor(np.asarray(image), cv.COLOR_RGB2BGR)


def features(image, polygon=None):
    height, width = image.shape[:2]
    scale = min(1, 1500 / max(height, width))
    small = cv.resize(image, None, fx=scale, fy=scale, interpolation=cv.INTER_AREA)
    mask = None
    if polygon is not None:
        mask = np.zeros(small.shape[:2], np.uint8)
        cv.fillConvexPoly(mask, np.int32(polygon * scale), 255)
    points, descriptors = cv.SIFT_create(nfeatures=6000).detectAndCompute(
        cv.cvtColor(small, cv.COLOR_BGR2GRAY), mask
    )
    return np.float32([p.pt for p in points]).reshape(-1, 2) / scale, descriptors


def fit_detail(image, target_features, target_scale):
    ref_points, ref_desc = target_features
    points, desc = features(image)
    if desc is None or ref_desc is None or min(len(desc), len(ref_desc)) < 2:
        return None, None, {"reason": "Insufficient texture"}
    matches = cv.BFMatcher().knnMatch(desc, ref_desc, k=2)
    good = [a for a, b in matches if a.distance < 0.72 * b.distance]
    if len(good) < 16:
        return (
            None,
            None,
            {"matches": len(good), "reason": "Too few distinctive matches"},
        )
    src = np.float32([points[m.queryIdx] for m in good])
    dst = np.float32([ref_points[m.trainIdx] for m in good])
    transform, mask = cv.findHomography(src, dst, cv.USAC_MAGSAC, 3 * target_scale)
    if transform is None:
        return None, None, {"reason": "No consistent planar fit"}
    inside = mask.ravel().astype(bool)
    n = int(inside.sum())
    report = {"matches": len(good), "inliers": n}
    if n < 16 or n < 0.35 * len(good):
        return None, None, {**report, "reason": "Inconsistent matches"}
    projected = cv.perspectiveTransform(src[inside, None], transform)[:, 0]
    distance = np.linalg.norm(projected - dst[inside], axis=1) / target_scale
    report["medianErrorAt1000px"] = round(float(np.median(distance)), 3)
    report["p90ErrorAt1000px"] = round(float(np.percentile(distance, 90)), 3)
    return transform, dst[inside], report


def run(config, output):
    spec = json.loads(config.read_text())
    width, height = spec["size"]
    if not all(isinstance(i, int) and 8 <= i <= 4096 for i in [width, height]):
        raise ValueError("Use output dimensions between 8 and 4096 pixels.")
    path = config.parent / spec["reference"]
    ref = load_photo(path)
    corners = np.float32(spec["corners"])
    if (
        corners.shape != (4, 2)
        or not np.isfinite(corners).all()
        or corners.min() < 0
        or corners.max() > 1
    ):
        raise ValueError(
            "Supply four normalized coordinates inside the reference photo."
        )
    corners *= [ref.shape[1] - 1, ref.shape[0] - 1]
    if not cv.isContourConvex(corners) or cv.contourArea(corners, oriented=True) < 16:
        raise ValueError("Corners must enclose a clockwise convex surface.")
    target = np.float32(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]
    )
    rectify = cv.getPerspectiveTransform(corners, target)
    canvas = cv.warpPerspective(ref, rectify, (width, height), flags=cv.INTER_CUBIC)
    reference_features = features(ref, corners)
    report = {
        "reference": str(path),
        "referenceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "corners": spec["corners"],
        "size": spec["size"],
        "details": [],
    }
    for name in spec["details"]:
        path = config.parent / name
        img = load_photo(path)
        transform, inliers, evidence = fit_detail(
            img, reference_features, max(ref.shape[:2]) / 1000
        )
        evidence.update(
            photo=name, sha256=hashlib.sha256(path.read_bytes()).hexdigest()
        )
        report["details"].append(evidence)
        if transform is None:
            continue
        # Use detail only inside the convex hull of verified correspondences. Featureless
        # regions outside that support retain the wide reference observation.
        hull = cv.convexHull(cv.perspectiveTransform(inliers[:, None], rectify))
        support = np.zeros((height, width), np.uint8)
        cv.fillConvexPoly(support, np.int32(hull), 255)
        if np.count_nonzero(support) < width * height * 0.015:
            evidence["reason"] = "Matches cover too little of the chosen surface"
            continue
        warped = cv.warpPerspective(
            img, rectify @ transform, (width, height), flags=cv.INTER_CUBIC
        )
        valid = (
            cv.warpPerspective(
                np.full(img.shape[:2], 255, np.uint8),
                rectify @ transform,
                (width, height),
            )
            == 255
        )
        support[~valid] = 0
        alpha = np.clip(cv.distanceTransform(support, cv.DIST_L2, 3) / 20, 0, 1)[
            :, :, None
        ]
        canvas = np.rint(canvas * (1 - alpha) + warped * alpha).astype(np.uint8)
        evidence.update(
            sourceToReference=transform.tolist(), usedFraction=float(np.mean(alpha))
        )
    output.mkdir(parents=True, exist_ok=True)
    if not cv.imwrite(
        str(output / "texture.jpg"), canvas, [cv.IMWRITE_JPEG_QUALITY, 95]
    ):
        raise OSError("Could not write texture")
    (output / "fit.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv.setNumThreads(2)
    run(args.config, args.output)
