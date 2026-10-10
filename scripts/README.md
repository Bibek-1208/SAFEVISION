# SafeVision AI — Scripts Directory Reorganization

In **Phase 0 Project Structure Cleanup**, operational, benchmark, and verification scripts have been organized into professional, domain-specific directories under [`tools/`](../tools/) and [`docs/reports/`](../docs/reports/):

## 1. Validation Suites ([`tools/validation/`](../tools/validation/))
- [`tools/validation/phase6_validation_suite.py`](../tools/validation/phase6_validation_suite.py) — Complete 21-point Phase 6 regression and multi-camera benchmark suite.
- [`tools/validation/phase5_validation_suite.py`](../tools/validation/phase5_validation_suite.py) — 13-point Phase 5 regression validation suite.
- [`tools/validation/validate_multi_ppe_real.py`](../tools/validation/validate_multi_ppe_real.py) — Multi-person PPE detection on real warehouse footage.
- [`tools/validation/production_ai_acceptance.py`](../tools/validation/production_ai_acceptance.py) — Production AI acceptance runner (delegates to `ai/scripts/production_ai_acceptance.py`).
- [`tools/validation/evaluate.py`](../tools/validation/evaluate.py) — Model evaluation runner (delegates to `ai/scripts/evaluate.py`).
- [`tools/validation/validate_real_model.py`](../tools/validation/validate_real_model.py) — Single-image validation runner.
- [`tools/validation/validate_real_video.py`](../tools/validation/validate_real_video.py) — Video inference validation runner.

## 2. Performance Benchmarks ([`tools/benchmarks/`](../tools/benchmarks/))
- [`tools/benchmarks/benchmark_performance.py`](../tools/benchmarks/benchmark_performance.py) — Inference latency and throughput benchmarking.
- [`tools/benchmarks/benchmark_multicamera.py`](../tools/benchmarks/benchmark_multicamera.py) — Multi-camera capacity and resource utilization benchmark.
- [`tools/benchmarks/benchmark_4cam_optimizations.py`](../tools/benchmarks/benchmark_4cam_optimizations.py) — 4-camera queue and scheduling optimization benchmark.
- [`tools/benchmarks/phase4_comprehensive_benchmarks.py`](../tools/benchmarks/phase4_comprehensive_benchmarks.py) — Phase 4 end-to-end benchmark suite.
- [`tools/benchmarks/phase4_multicam_and_incident_latency.py`](../tools/benchmarks/phase4_multicam_and_incident_latency.py) — Incident generation latency across multiple cameras.
- [`tools/benchmarks/phase4_optimization_before_after.py`](../tools/benchmarks/phase4_optimization_before_after.py) — Before/after comparative optimization analysis.
- [`tools/benchmarks/phase4_stage_profiler.py`](../tools/benchmarks/phase4_stage_profiler.py) — Pipeline stage execution profiler.
- [`tools/benchmarks/phase4_warmup_analysis.py`](../tools/benchmarks/phase4_warmup_analysis.py) — Inference engine cold-start and warmup analysis.
- [`tools/benchmarks/phase4_reproduce_benchmark.py`](../tools/benchmarks/phase4_reproduce_benchmark.py) — Baseline RTSP benchmark reproduction.

## 3. End-to-End Verification ([`tools/verification/`](../tools/verification/))
- [`tools/verification/verify_e2e_incidents.mjs`](../tools/verification/verify_e2e_incidents.mjs) — Full live incident candidate to MongoDB Change Stream to Socket.IO verification.
- [`tools/verification/verify_rtsp_live_suite.mjs`](../tools/verification/verify_rtsp_live_suite.mjs) — Live MediaMTX RTSP stream ingestion verification.
- [`tools/verification/rtsp_streamer_bridge.py`](../tools/verification/rtsp_streamer_bridge.py) — Decoupled RTSP stream reading bridge for test harnesses.
- [`tools/verification/phase4_regression_test.py`](../tools/verification/phase4_regression_test.py) — 10-point Phase 4 regression test runner.

## 4. Test Suites ([`tests/`](../tests/))
- [`tests/test_rbac_sbac.js`](../tests/test_rbac_sbac.js) — 21-check automated RBAC & SBAC security regression suite.
- [`tests/test_verify.js`](../tests/test_verify.js) — Lightweight sanity verification script.

## 5. Empirical Results & Reports ([`docs/reports/`](../docs/reports/))
- All JSON reports and empirical benchmark telemetry outputs are archived in `docs/reports/`.
