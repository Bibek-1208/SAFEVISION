"""
SafeVision AI - Batch Prediction / Inference CLI
Runs detection on images or video files and outputs bounding box JSON / annotated frames.
"""

import os
import argparse
import json
import cv2

def predict_source(source_path: str, output_dir: str, conf_threshold: float = 0.45):
    os.makedirs(output_dir, exist_ok=True)
    print(f"[SafeVision AI] Running inference on: {source_path}")

    # Import our industrial safety detector
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from inference.detector import IndustrialSafetyDetector

    detector = IndustrialSafetyDetector(models_dir=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models")))

    if os.path.isfile(source_path):
        with open(source_path, "rb") as f:
            image_bytes = f.read()
        res = detector.infer_image(image_bytes=image_bytes, camera_id="OFFLINE-TEST", zone="Audit Zone", conf_thresh=conf_threshold)

        out_json = os.path.join(output_dir, "inference_result.json")
        with open(out_json, "w") as jf:
            jf.write(res.model_dump_json(indent=2))
        print(f"[SafeVision AI] Inference results saved to: {out_json}")
        print(f"Persons detected: {res.total_persons_detected}, Violations: {res.total_violations_detected}")
    elif os.path.isdir(source_path):
        results = []
        for fname in os.listdir(source_path):
            fpath = os.path.join(source_path, fname)
            if fname.lower().endswith((".jpg", ".png", ".jpeg")):
                with open(fpath, "rb") as f:
                    ib = f.read()
                r = detector.infer_image(image_bytes=ib, camera_id="BATCH-TEST", zone="Audit Zone", conf_thresh=conf_threshold)
                results.append({"file": fname, "data": r.model_dump()})
        out_json = os.path.join(output_dir, "batch_results.json")
        with open(out_json, "w") as jf:
            json.dump(results, jf, indent=2)
        print(f"[SafeVision AI] Batch completed ({len(results)} images processed).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict on image or directory")
    parser.add_argument("--source", type=str, required=True, help="Path to image or directory")
    parser.add_argument("--output", type=str, default="inference_output", help="Directory for results")
    parser.add_argument("--conf", type=float, default=0.45, help="Confidence threshold")
    args = parser.parse_args()

    predict_source(args.source, args.output, args.conf)
