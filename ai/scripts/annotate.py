#!/usr/bin/env python3
"""
=============================================================================
SafeVision AI — Industrial Dataset & Annotation Suite (Phase 12.2B)
=============================================================================
Unified Multi-Media Dataset Management & Ground-Truth Annotation Suite:
- Navigation: [ Dataset ] [ Media ] [ Annotate ] [ Classes ] [ Quality Control ]
- Dynamic Active Drawing Classes backed by authoritative classes.json
- Preserved Phase 12.2A Decoupled Multi-Box State Architecture
- Multi-Photo & Multi-Video Bulk Ingestion with Traceability Metadata
- Configurable Frame Sampling (Every N sec/frames, Max limit) & Quality Filters
- Split Management (Train / Val / Test) with Zero Duplicate Guarantee
- 12-Point Dataset Quality Control Audit Engine
=============================================================================
"""

import os
import sys
import json
import base64
import argparse
import http.server
import socketserver
import urllib.parse
from pathlib import Path
from typing import Dict, List, Any

# Ensure project root is in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ai.scripts.dataset_manager import ClassRegistry, MediaManager, DatasetAuditor

DEFAULT_DATASET_DIR = "ai/datasets/safevision_ppe_v1"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SafeVision AI — Industrial Dataset & Annotation Suite</title>
<style>
  :root {
    --bg-primary: #0b1120;
    --bg-sidebar: #0f172a;
    --bg-card: #1e293b;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --text-primary: #f8fafc;
    --text-muted: #94a3b8;
    --border: #334155;
    --success: #10b981;
    --success-hover: #059669;
    --danger: #ef4444;
    --danger-hover: #dc2626;
    --warning: #f59e0b;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  /* TOP HEADER & NAVIGATION */
  #topbar {
    height: 52px;
    min-height: 52px;
    background-color: var(--bg-sidebar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    z-index: 20;
    flex-shrink: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-logo {
    width: 22px;
    height: 22px;
    background: #38bdf8;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    color: #0b1120;
    font-size: 13px;
  }
  .brand-title {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #f8fafc;
  }
  .nav-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0b1120;
    padding: 3px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .nav-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.82rem;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nav-btn:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.05); }
  .nav-btn.active {
    background: var(--accent);
    color: white;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
  }
  .header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .meta-pill {
    font-size: 0.75rem;
    font-family: monospace;
    background: #1e293b;
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 4px;
    color: #94a3b8;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 9999px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .badge.verified { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
  .badge.unreviewed { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
  .badge.ready { background: rgba(16, 185, 129, 0.25); color: #34d399; border: 1px solid #059669; }
  .badge.notready { background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid #d97706; }

  /* VIEWS CONTAINER */
  #view-container {
    flex: 1;
    width: 100vw;
    height: calc(100vh - 52px);
    overflow: hidden;
    position: relative;
  }
  .view-panel {
    display: none !important;
    width: 100%;
    height: 100%;
    overflow-y: auto;
  }
  .view-panel.active { display: flex !important; }

  /* BUTTONS & FORM ELEMENTS */
  .btn {
    background: var(--accent);
    color: white;
    font-weight: 600;
    cursor: pointer;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.82rem;
    transition: background 0.15s, transform 0.05s;
  }
  .btn:hover { background: var(--accent-hover); }
  .btn:active { transform: scale(0.99); }
  .btn-secondary { background: #334155; color: #f8fafc; }
  .btn-secondary:hover { background: #475569; }
  .btn-success { background: var(--success); }
  .btn-success:hover { background: var(--success-hover); }
  .btn-danger { background: var(--danger); }
  .btn-danger:hover { background: var(--danger-hover); }
  .btn-sm { padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; }
  select, input, textarea {
    width: 100%;
    padding: 8px 10px;
    background: #0b1120;
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  select:focus, input:focus, textarea:focus { outline: none; border-color: var(--accent); }

  /* TAB 1: DATASET DASHBOARD */
  #dataset-view {
    padding: 24px 32px;
    flex-direction: column;
    gap: 20px;
    background: #060b14;
    overflow-y: auto;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 16px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stat-card .label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
  .stat-card .value { font-size: 1.6rem; font-weight: 800; color: #f8fafc; font-family: monospace; }
  .stat-card .hint { font-size: 0.7rem; color: #64748b; }
  .split-summary-bar {
    display: flex;
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
    margin-top: 8px;
    background: #0b1120;
    border: 1px solid var(--border);
  }
  .split-summary-bar div { height: 100%; }

  /* TAB 2: MEDIA LIBRARY */
  #media-view {
    flex-direction: column;
    background: #060b14;
    padding: 20px 28px;
    gap: 16px;
    overflow-y: auto;
  }
  .media-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .filter-group { display: flex; gap: 6px; }
  .filter-btn {
    background: #1e293b;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }
  .filter-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
    margin-top: 6px;
  }
  .media-card {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform 0.1s, border-color 0.15s;
  }
  .media-card:hover { border-color: #475569; transform: translateY(-2px); }
  .media-card .card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .media-card .media-title {
    font-size: 0.83rem;
    font-weight: 700;
    color: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .media-card .media-meta {
    font-size: 0.72rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: monospace;
  }
  .split-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: #0b1120;
    border: 1px solid #475569;
    color: #38bdf8;
  }

  /* TAB 3: ANNOTATION STUDIO (Preserved Phase 12.2A Layout) */
  #annotate-view {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  #sidebar {
    width: 330px;
    min-width: 300px;
    max-width: 350px;
    height: 100%;
    background-color: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 14px;
    gap: 12px;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .control-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .active-class-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #0b1120;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-top: 4px;
  }
  .color-swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .active-classes-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
    max-height: 80px;
    overflow-y: auto;
  }
  .chip {
    font-size: 0.68rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: #1e293b;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .chip.selected { border-color: #38bdf8; background: #0f2744; }
  #box-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 190px;
    overflow-y: auto;
    margin-top: 4px;
  }
  .box-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    background: #0b1120;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .box-item:hover { border-color: #475569; }
  .box-item.active { border-color: #38bdf8; background: #0f2744; }
  .del-btn {
    background: none;
    border: none;
    color: var(--danger);
    cursor: pointer;
    font-weight: 700;
    width: auto;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .del-btn:hover { background: rgba(239, 68, 68, 0.15); }
  #main {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: #020617;
    overflow: hidden;
    position: relative;
    padding: 12px;
  }
  #canvas-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  #ann-canvas {
    display: block;
    cursor: crosshair;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85);
    border: 1px solid #334155;
    border-radius: 4px;
  }
  #cursor-overlay {
    position: absolute;
    bottom: 8px;
    right: 12px;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-family: monospace;
    color: var(--text-muted);
  }

  /* TAB 4: CLASSES VIEW */
  #classes-view {
    flex-direction: column;
    background: #060b14;
    padding: 24px 32px;
    gap: 16px;
    overflow-y: auto;
  }
  .classes-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .classes-table th, .classes-table td {
    padding: 10px 14px;
    font-size: 0.82rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .classes-table th { background: #0b1120; color: var(--text-muted); font-weight: 700; text-transform: uppercase; font-size: 0.72rem; }
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 34px;
    height: 18px;
  }
  .toggle-switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #334155; transition: .2s; border-radius: 18px;
  }
  .slider:before {
    position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px;
    background-color: white; transition: .2s; border-radius: 50%;
  }
  input:checked + .slider { background-color: var(--success); }
  input:checked + .slider:before { transform: translateX(16px); }

  /* TAB 5: QUALITY CONTROL VIEW */
  #qc-view {
    flex-direction: column;
    background: #060b14;
    padding: 24px 32px;
    gap: 18px;
    overflow-y: auto;
  }
  .qc-banner {
    padding: 18px 24px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid;
  }
  .qc-banner.pass { background: rgba(16, 185, 129, 0.15); border-color: #059669; color: #34d399; }
  .qc-banner.fail { background: rgba(239, 68, 68, 0.15); border-color: #dc2626; color: #f87171; }
  .qc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
  }
  .qc-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* MODALS */
  .modal-overlay {
    display: none;
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    z-index: 100;
    align-items: center;
    justify-content: center;
  }
  .modal-overlay.open { display: flex; }
  .modal-box {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: 480px;
    max-width: 90vw;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.8);
  }
  .modal-title { font-size: 1.05rem; font-weight: 700; color: #f8fafc; }
  .btn-row { display: flex; gap: 8px; justify-content: flex-end; }
</style>
</head>
<body>

<header id="topbar">
  <div class="brand">
    <div class="brand-logo">SV</div>
    <div>
      <div class="brand-title">SafeVision AI</div>
      <div style="font-size:0.68rem; color:var(--text-muted); font-family:monospace;">DATASET + ANNOTATION SUITE (12.2B)</div>
    </div>
  </div>

  <nav class="nav-tabs">
    <button class="nav-btn" onclick="switchTab('dataset-view')" id="tab-dataset">📊 Dataset</button>
    <button class="nav-btn" onclick="switchTab('media-view')" id="tab-media">📁 Media Library</button>
    <button class="nav-btn active" onclick="switchTab('annotate-view')" id="tab-annotate">✏️ Annotate</button>
    <button class="nav-btn" onclick="switchTab('classes-view')" id="tab-classes">🏷️ Classes</button>
    <button class="nav-btn" onclick="switchTab('qc-view')" id="tab-qc">🔍 Quality Control</button>
  </nav>

  <div class="header-badges">
    <span id="img-dim-badge" class="meta-pill">Res: --</span>
    <span id="scale-badge" class="meta-pill">Fit: 100%</span>
    <span id="readiness-badge" class="badge ready">READY FOR TRAINING</span>
  </div>
</header>

<div id="view-container">

  <!-- TAB 1: DATASET DASHBOARD -->
  <div id="dataset-view" class="view-panel">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2 style="margin:0; font-size:1.3rem;">SafeVision Dataset Intelligence</h2>
        <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.8rem;">Authoritative Ground-Truth Inventory & Split Verification</p>
      </div>
      <button class="btn btn-secondary" onclick="loadDatasetSummary()">↻ Refresh Stats</button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="label">Total Media Items</span>
        <span class="value" id="stat-total-media">0</span>
        <span class="hint">Images + Video Sources</span>
      </div>
      <div class="stat-card">
        <span class="label">Video Sources</span>
        <span class="value" id="stat-videos">0</span>
        <span class="hint">Industrial Cameras / Footage</span>
      </div>
      <div class="stat-card">
        <span class="label">Extracted Frames</span>
        <span class="value" id="stat-frames">0</span>
        <span class="hint">Candidate Annotation Frames</span>
      </div>
      <div class="stat-card">
        <span class="label">Human Verified</span>
        <span class="value" id="stat-verified" style="color:#34d399;">0</span>
        <span class="hint">Passed Quality Gate</span>
      </div>
      <div class="stat-card">
        <span class="label">Active Classes</span>
        <span class="value" id="stat-classes" style="color:#38bdf8;">0</span>
        <span class="hint">SafeVision Ontology</span>
      </div>
      <div class="stat-card">
        <span class="label">Quality Rejections</span>
        <span class="value" id="stat-rejected" style="color:#f87171;">0</span>
        <span class="hint">Blur / Duplicate Filtered</span>
      </div>
    </div>

    <div class="stat-card" style="margin-top:10px;">
      <span class="label">Dataset Split Distribution</span>
      <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.85rem; font-weight:600;">
        <span style="color:#38bdf8;">Train: <span id="split-cnt-train">0</span> frames</span>
        <span style="color:#a855f7;">Validation: <span id="split-cnt-val">0</span> frames</span>
        <span style="color:#34d399;">Test: <span id="split-cnt-test">0</span> frames</span>
      </div>
      <div class="split-summary-bar">
        <div id="bar-train" style="width:62%; background:#38bdf8;"></div>
        <div id="bar-val" style="width:18%; background:#a855f7;"></div>
        <div id="bar-test" style="width:20%; background:#34d399;"></div>
      </div>
    </div>
  </div>

  <!-- TAB 2: MEDIA LIBRARY -->
  <div id="media-view" class="view-panel">
    <div class="media-toolbar">
      <div class="filter-group">
        <button class="filter-btn active" onclick="filterMedia('all')">All Media</button>
        <button class="filter-btn" onclick="filterMedia('images')">Photos Only</button>
        <button class="filter-btn" onclick="filterMedia('videos')">Videos Only</button>
        <button class="filter-btn" onclick="filterMedia('frames')">Video Frames</button>
      </div>
      <button class="btn btn-success" onclick="openAddMediaModal()">+ ADD MEDIA</button>
    </div>

    <div class="media-grid" id="media-cards-container"></div>
  </div>

  <!-- TAB 3: ANNOTATION STUDIO (Preserved Phase 12.2A Layout) -->
  <div id="annotate-view" class="view-panel active">
    <aside id="sidebar">
      <div class="control-group">
        <label>Dataset Partition</label>
        <select id="split-select" onchange="changeSplit()">
          <option value="train">Train Split</option>
          <option value="val">Validation Split</option>
          <option value="test">Test Split</option>
        </select>
      </div>

      <div class="control-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label>Frame Selector</label>
          <span style="font-size:0.75rem; color:#38bdf8; font-family:monospace;">
            <span id="img-index">0</span> / <span id="img-total">0</span>
          </span>
        </div>
        <select id="image-select" onchange="loadImage()"></select>
        <div class="btn-row" style="margin-top:4px;">
          <button class="btn btn-secondary" onclick="prevImage()" title="Prev (A or Left Arrow)">◄ Prev</button>
          <button class="btn btn-secondary" onclick="nextImage()" title="Next (D or Right Arrow)">Next ►</button>
        </div>
      </div>

      <div class="control-group">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label>Active Drawing Class</label>
          <button class="btn btn-sm btn-secondary" onclick="openAddClassModal()">+ Add Class</button>
        </div>
        <select id="class-select" onchange="onClassSelectChange()"></select>
        <div class="active-class-pill">
          <div id="active-swatch" class="color-swatch" style="background:#22c55e;"></div>
          <span id="active-cls-name" style="font-weight:700; color:#f8fafc;">person</span>
        </div>
        <label style="margin-top:6px; font-size:0.68rem;">Active Classes Quick-Select:</label>
        <div class="active-classes-chips" id="active-chips"></div>
      </div>

      <div class="control-group" style="flex:1; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label>Bounding Boxes</label>
          <span id="box-count" class="meta-pill" style="padding:1px 6px;">0</span>
        </div>
        <div id="box-list"></div>
        <button class="btn btn-secondary" id="btn-reassign" onclick="reassignSelectedBoxClass()" style="display:none; margin-top:4px; font-size:0.75rem; padding:6px;">
          ↻ Reassign Selected to Active Class
        </button>
      </div>

      <div class="control-group">
        <button class="btn btn-success" onclick="saveAnnotations()" id="btn-save">
          ✔ Save Verified Labels
        </button>
        <div class="btn-row" style="margin-top:6px;">
          <button class="btn btn-danger" onclick="clearAllBoxes()">Clear All</button>
          <button class="btn btn-secondary" onclick="deleteSelectedBox()" id="btn-del-sel">Delete Box</button>
        </div>
      </div>

      <div class="control-group" style="border-top:1px solid var(--border); padding-top:8px;">
        <label>Move Split</label>
        <div class="btn-row">
          <button class="btn btn-sm btn-secondary" onclick="moveCurrentFrameSplit('train')">→ Train</button>
          <button class="btn btn-sm btn-secondary" onclick="moveCurrentFrameSplit('val')">→ Val</button>
          <button class="btn btn-sm btn-secondary" onclick="moveCurrentFrameSplit('test')">→ Test</button>
        </div>
      </div>
    </aside>

    <main id="main">
      <div id="canvas-wrapper">
        <canvas id="ann-canvas"></canvas>
        <div id="cursor-overlay">X: 0, Y: 0</div>
      </div>
    </main>
  </div>

  <!-- TAB 4: CLASSES VIEW -->
  <div id="classes-view" class="view-panel">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2 style="margin:0; font-size:1.3rem;">Authoritative Class Registry</h2>
        <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.8rem;">SafeVision 17-Class Base Ontology + Dynamic Extended Classes</p>
      </div>
      <button class="btn btn-success" onclick="openAddClassModal()">+ ADD CLASS</button>
    </div>

    <table class="classes-table">
      <thead>
        <tr>
          <th style="width:60px;">ID</th>
          <th style="width:40px;">Color</th>
          <th>Class Name</th>
          <th>Display Name</th>
          <th>Category</th>
          <th>Description</th>
          <th style="width:90px;">Active</th>
        </tr>
      </thead>
      <tbody id="classes-table-body"></tbody>
    </table>
  </div>

  <!-- TAB 5: QUALITY CONTROL VIEW -->
  <div id="qc-view" class="view-panel">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2 style="margin:0; font-size:1.3rem;">12-Point Dataset Quality Control Audit</h2>
        <p style="margin:4px 0 0; color:var(--text-muted); font-size:0.8rem;">Automated Geometry, Class Registry, Image Integrity & Leakage Verification</p>
      </div>
      <button class="btn btn-success" onclick="runQCAudit()">RUN DATASET AUDIT</button>
    </div>

    <div class="qc-banner pass" id="qc-banner">
      <div>
        <div style="font-size:1.2rem; font-weight:800;" id="qc-status-text">AUDIT STATUS: READY</div>
        <div style="font-size:0.8rem; margin-top:2px;" id="qc-summary-text">Click 'RUN DATASET AUDIT' to execute validation.</div>
      </div>
      <span class="badge ready" id="qc-score-badge">12 / 12 CHECKS</span>
    </div>

    <div class="qc-grid" id="qc-checks-grid"></div>
  </div>

</div>

<!-- MODAL: ADD CLASS -->
<div class="modal-overlay" id="modal-add-class">
  <div class="modal-box">
    <div class="modal-title">ADD SAFEVISION CLASS</div>
    <div class="control-group">
      <label>Class Name (Normalized, e.g. lab-coat):</label>
      <input type="text" id="new-cls-name" placeholder="lab-coat">
    </div>
    <div class="control-group">
      <label>Display Name (e.g. Lab Coat):</label>
      <input type="text" id="new-cls-disp" placeholder="Lab Coat">
    </div>
    <div class="control-group">
      <label>Category:</label>
      <select id="new-cls-cat">
        <option value="PPE">PPE</option>
        <option value="PERSON">PERSON</option>
        <option value="HAZARD">HAZARD</option>
        <option value="SAFETY">SAFETY</option>
        <option value="OTHER">OTHER</option>
      </select>
    </div>
    <div class="control-group">
      <label>Description:</label>
      <input type="text" id="new-cls-desc" placeholder="Specialized protective lab coverall">
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="closeModals()">Cancel</button>
      <button class="btn btn-success" onclick="submitAddClass()">Add Class</button>
    </div>
  </div>
</div>

<!-- MODAL: ADD MEDIA -->
<div class="modal-overlay" id="modal-add-media">
  <div class="modal-box" style="width:550px;">
    <div class="modal-title">+ ADD MEDIA TO DATASET</div>
    
    <div class="control-group">
      <label>Select Multiple Photos (JPG, JPEG, PNG, WEBP, BMP):</label>
      <input type="file" id="media-img-picker" multiple accept=".jpg,.jpeg,.png,.webp,.bmp">
    </div>

    <div class="control-group" style="margin-top:6px;">
      <label>Select Multiple Videos (MP4, MOV, AVI, MKV, WEBM):</label>
      <input type="file" id="media-vid-picker" multiple accept=".mp4,.mov,.avi,.mkv,.webm">
    </div>

    <div class="control-group" style="margin-top:6px;">
      <label>Target Partition Split:</label>
      <select id="media-target-split">
        <option value="train">Train Split (Recommended)</option>
        <option value="val">Validation Split</option>
        <option value="test">Test Split</option>
      </select>
    </div>

    <div style="background:#0b1120; border:1px solid var(--border); border-radius:6px; padding:10px; margin-top:4px;">
      <label style="color:#38bdf8;">Video Frame Sampling Rules:</label>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <div style="flex:1;">
          <span style="font-size:0.72rem; color:var(--text-muted);">Sampling Method:</span>
          <select id="media-sample-method" style="margin-top:2px;">
            <option value="time">Every N seconds</option>
            <option value="frame">Every N frames</option>
          </select>
        </div>
        <div style="width:100px;">
          <span style="font-size:0.72rem; color:var(--text-muted);">Interval (sec/frm):</span>
          <input type="number" id="media-sample-interval" value="2.0" step="0.5" style="margin-top:2px;">
        </div>
        <div style="width:110px;">
          <span style="font-size:0.72rem; color:var(--text-muted);">Max Frames:</span>
          <input type="number" id="media-max-frames" value="500" style="margin-top:2px;">
        </div>
      </div>
      <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="media-quality-filter" checked style="width:auto;">
        <span style="font-size:0.75rem; color:#f8fafc;">Quality Filter (Reject Blurry, Low Content & Near-Duplicate Frames)</span>
      </div>
    </div>

    <div id="import-status-text" style="font-size:0.8rem; color:#38bdf8; min-height:18px;"></div>

    <div class="btn-row">
      <button class="btn btn-secondary" onclick="closeModals()">Cancel</button>
      <button class="btn btn-success" id="btn-do-import" onclick="executeMediaImport()">Start Ingestion</button>
    </div>
  </div>
</div>

<script>
// DYNAMIC COLOR ENGINE (Guarantees distinct, stable color for any class ID)
const STATIC_PALETTE = [
  "#22c55e", "#06b6d4", "#0ea5e9", "#f59e0b", "#f97316", "#ec4899",
  "#a855f7", "#64748b", "#8b5cf6", "#eab308", "#ef4444", "#14b8a6",
  "#3b82f6", "#10b981", "#d946ef", "#6366f1", "#f43f5e", "#84cc16",
  "#0284c7", "#ca8a04", "#e11d48", "#9333ea", "#0d9488", "#16a34a"
];
function getClassColor(cid) {
  if (cid >= 0 && cid < STATIC_PALETTE.length) return STATIC_PALETTE[cid];
  const hue = Math.round((cid * 137.5) % 360);
  return `hsl(${hue}, 75%, 55%)`;
}

// STATE ARCHITECTURE
let classesRegistry = []; // Authoritative class list from server
let currentSplit = "train";
let imageList = [];
let currentIndex = 0;
let currentBoxes = []; // Independent array of { id, classId, className, xc, yc, w, h }
let selectedClassId = 0; // Class used for DRAWING NEW BOXES
let selectedBoxId = null; // ID of selected/inspected box
let nextBoxId = 1;

let imgElement = new Image();
let isDrawing = false;
let startX = 0, startY = 0;
let curX = 0, curY = 0;

const canvas = document.getElementById("ann-canvas");
const ctx = canvas.getContext("2d");
const cursorOverlay = document.getElementById("cursor-overlay");

function init() {
  fetchClasses().then(() => {
    fetchImages();
    loadDatasetSummary();
  });
  setupKeyboardShortcuts();
  window.addEventListener("resize", onWindowResize);
}

// TAB NAVIGATION
function switchTab(tabId) {
  document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  
  const target = document.getElementById(tabId);
  if (target) target.classList.add("active");

  const btnMap = {
    "dataset-view": "tab-dataset",
    "media-view": "tab-media",
    "annotate-view": "tab-annotate",
    "classes-view": "tab-classes",
    "qc-view": "tab-qc"
  };
  if (btnMap[tabId]) document.getElementById(btnMap[tabId]).classList.add("active");

  if (tabId === "dataset-view") loadDatasetSummary();
  if (tabId === "media-view") loadMediaLibrary("all");
  if (tabId === "classes-view") renderClassesTable();
  if (tabId === "qc-view") runQCAudit();
  if (tabId === "annotate-view") { updateScaleBadge(); render(); }
}

// -------------------------------------------------------------
// DYNAMIC CLASS REGISTRY LOGIC
// -------------------------------------------------------------
function fetchClasses() {
  return fetch("/api/classes")
    .then(r => r.json())
    .then(data => {
      classesRegistry = data.classes || [];
      populateClassSelector();
      renderActiveChips();
      renderClassesTable();
    });
}

function populateClassSelector() {
  const sel = document.getElementById("class-select");
  sel.innerHTML = "";
  const activeClasses = classesRegistry.filter(c => c.active !== false);
  activeClasses.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.id}: ${c.displayName || c.name}`;
    sel.appendChild(opt);
  });

  if (!activeClasses.some(c => c.id === selectedClassId)) {
    selectedClassId = activeClasses.length > 0 ? activeClasses[0].id : 0;
  }
  sel.value = selectedClassId;
  updateActiveDrawingPill();
}

function updateActiveDrawingPill() {
  const cls = classesRegistry.find(c => c.id === selectedClassId);
  const name = cls ? (cls.displayName || cls.name) : `Class ${selectedClassId}`;
  document.getElementById("active-cls-name").textContent = name;
  document.getElementById("active-swatch").style.backgroundColor = getClassColor(selectedClassId);
}

function onClassSelectChange() {
  selectedClassId = parseInt(document.getElementById("class-select").value, 10);
  updateActiveDrawingPill();
  renderActiveChips();
  // NEVER mutate currentBoxes!
}

function renderActiveChips() {
  const container = document.getElementById("active-chips");
  container.innerHTML = "";
  const activeClasses = classesRegistry.filter(c => c.active !== false);
  activeClasses.forEach(c => {
    const chip = document.createElement("div");
    chip.className = "chip" + (c.id === selectedClassId ? " selected" : "");
    chip.innerHTML = `
      <div class="color-swatch" style="width:8px; height:8px; background:${getClassColor(c.id)};"></div>
      <span>${c.displayName || c.name}</span>
    `;
    chip.onclick = () => {
      selectedClassId = c.id;
      document.getElementById("class-select").value = c.id;
      updateActiveDrawingPill();
      renderActiveChips();
    };
    container.appendChild(chip);
  });
}

function renderClassesTable() {
  const tbody = document.getElementById("classes-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  classesRegistry.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:monospace; font-weight:700;">${c.id}</td>
      <td><div class="color-swatch" style="background:${getClassColor(c.id)};"></div></td>
      <td style="font-family:monospace;">${c.name}</td>
      <td style="font-weight:600; color:#f8fafc;">${c.displayName || c.name}</td>
      <td><span class="meta-pill">${c.category || 'OTHER'}</span></td>
      <td style="color:var(--text-muted); font-size:0.75rem;">${c.description || '-'}</td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" ${c.active !== false ? 'checked' : ''} onchange="toggleClassActive(${c.id}, this.checked)">
          <span class="slider"></span>
        </label>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleClassActive(cid, active) {
  fetch("/api/classes/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: cid, active })
  })
  .then(r => r.json())
  .then(() => fetchClasses());
}

function openAddClassModal() {
  document.getElementById("modal-add-class").classList.add("open");
}

function submitAddClass() {
  const name = document.getElementById("new-cls-name").value.trim();
  const disp = document.getElementById("new-cls-disp").value.trim();
  const cat = document.getElementById("new-cls-cat").value;
  const desc = document.getElementById("new-cls-desc").value.trim();

  if (!name || !disp) {
    alert("Please enter both Class Name and Display Name.");
    return;
  }

  fetch("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, displayName: disp, category: cat, description: desc })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      closeModals();
      fetchClasses().then(() => {
        selectedClassId = res.class.id;
        populateClassSelector();
      });
    } else {
      alert("Error adding class: " + res.error);
    }
  });
}

function closeModals() {
  document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
}

// -------------------------------------------------------------
// MEDIA INGESTION & DATASET SPLIT MANAGEMENT
// -------------------------------------------------------------
function loadDatasetSummary() {
  fetch("/api/dataset/summary")
    .then(r => r.json())
    .then(data => {
      document.getElementById("stat-total-media").textContent = data.total_images;
      document.getElementById("stat-videos").textContent = data.videos_count;
      document.getElementById("stat-frames").textContent = data.extracted_frames;
      document.getElementById("stat-verified").textContent = data.human_verified_count;
      document.getElementById("stat-classes").textContent = data.classes_count;
      document.getElementById("stat-rejected").textContent = data.rejected_count;

      const splits = data.splits || { train: 0, val: 0, test: 0, total: 1 };
      document.getElementById("split-cnt-train").textContent = splits.train;
      document.getElementById("split-cnt-val").textContent = splits.val;
      document.getElementById("split-cnt-test").textContent = splits.test;

      const tot = Math.max(1, splits.total);
      document.getElementById("bar-train").style.width = `${Math.round((splits.train/tot)*100)}%`;
      document.getElementById("bar-val").style.width = `${Math.round((splits.val/tot)*100)}%`;
      document.getElementById("bar-test").style.width = `${Math.round((splits.test/tot)*100)}%`;

      const readyBadge = document.getElementById("readiness-badge");
      readyBadge.textContent = data.training_readiness;
      readyBadge.className = "badge " + (data.training_readiness === "READY FOR TRAINING" ? "ready" : "notready");
    });
}

function loadMediaLibrary(filter) {
  fetch(`/api/media?filter=${filter}`)
    .then(r => r.json())
    .then(data => {
      const container = document.getElementById("media-cards-container");
      container.innerHTML = "";
      (data.items || []).forEach(item => {
        const card = document.createElement("div");
        card.className = "media-card";
        const isVideo = item.type === "VIDEO";

        card.innerHTML = `
          <div class="card-head">
            <span class="split-badge" style="color:${isVideo ? '#f59e0b' : '#38bdf8'}">${item.type}</span>
            <span style="font-size:0.7rem; font-family:monospace; color:var(--text-muted);">${item.id}</span>
          </div>
          <div class="media-title" title="${item.filename}">${item.filename}</div>
          <div class="media-meta">
            <span>RES: ${item.resolution} ${item.duration ? '| DUR: ' + item.duration : ''}</span>
            <span>SRC: ${item.source}</span>
            <span>STATUS: ${item.status} ${item.boxCount ? '(' + item.boxCount + ' boxes)' : ''}</span>
          </div>
          <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center;">
            <span class="split-badge">${item.split || 'train'}</span>
            ${isVideo ? `
              <button class="btn btn-sm btn-secondary" onclick="openExtractFrames('${item.filename}')">Extract Frames</button>
            ` : `
              <button class="btn btn-sm btn-secondary" onclick="viewInAnnotator('${item.split}', '${item.filename}')">Annotate</button>
            `}
          </div>
        `;
        container.appendChild(card);
      });
    });
}

function filterMedia(type) {
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");
  loadMediaLibrary(type);
}

function openAddMediaModal() {
  document.getElementById("modal-add-media").classList.add("open");
  document.getElementById("import-status-text").textContent = "";
}

async function executeMediaImport() {
  const imgPicker = document.getElementById("media-img-picker");
  const vidPicker = document.getElementById("media-vid-picker");
  const split = document.getElementById("media-target-split").value;
  const statusEl = document.getElementById("import-status-text");

  const imgFiles = Array.from(imgPicker.files);
  const vidFiles = Array.from(vidPicker.files);

  if (imgFiles.length === 0 && vidFiles.length === 0) {
    alert("Please select at least one image or video file.");
    return;
  }

  statusEl.textContent = `Importing ${imgFiles.length} photos and ${vidFiles.length} videos...`;

  // Upload Images
  if (imgFiles.length > 0) {
    const imgPayload = [];
    for (const f of imgFiles) {
      const b64 = await readFileAsBase64(f);
      imgPayload.push({ filename: f.name, data_base64: b64 });
    }
    await fetch("/api/media/import_images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: imgPayload, split })
    });
  }

  // Upload Videos
  if (vidFiles.length > 0) {
    const vidPayload = [];
    for (const f of vidFiles) {
      const b64 = await readFileAsBase64(f);
      vidPayload.push({ filename: f.name, data_base64: b64 });
    }
    await fetch("/api/media/import_videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: vidPayload })
    });
  }

  statusEl.textContent = "Import successful!";
  setTimeout(() => {
    closeModals();
    loadDatasetSummary();
    loadMediaLibrary("all");
    fetchImages();
  }, 700);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const base64 = res.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openExtractFrames(videoName) {
  const method = prompt("Extract method ('time' or 'frame'):", "time") || "time";
  const interval = parseFloat(prompt("Sampling interval (seconds/frames):", "2.0") || "2.0");
  const maxF = parseInt(prompt("Max frames to extract:", "300") || "300", 10);
  const split = prompt("Target split ('train', 'val', 'test'):", "train") || "train";

  fetch("/api/media/extract_frames", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_filename: videoName,
      sample_method: method,
      sample_interval: interval,
      max_frames: maxF,
      quality_filter: true,
      target_split: split
    })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      alert(`Frame Extraction Complete!\nAccepted: ${res.result.accepted_count} frames\nFiltered/Rejected: ${res.result.rejected_count} frames`);
      loadDatasetSummary();
      loadMediaLibrary("all");
      fetchImages();
    } else {
      alert("Extraction error: " + res.error);
    }
  });
}

function moveCurrentFrameSplit(newSplit) {
  if (imageList.length === 0) return;
  const item = imageList[currentIndex];
  fetch("/api/media/move_split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: item.filename, target_split: newSplit })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      alert(`Frame moved to ${newSplit} split.`);
      currentSplit = newSplit;
      document.getElementById("split-select").value = newSplit;
      fetchImages();
    } else {
      alert("Error moving split: " + res.error);
    }
  });
}

function viewInAnnotator(split, filename) {
  currentSplit = split;
  document.getElementById("split-select").value = split;
  fetchImages().then(() => {
    const idx = imageList.findIndex(im => im.filename === filename);
    if (idx >= 0) {
      currentIndex = idx;
      loadImage();
    }
    switchTab("annotate-view");
  });
}

// -------------------------------------------------------------
// TAB 5: 12-POINT QUALITY CONTROL AUDIT
// -------------------------------------------------------------
function runQCAudit() {
  fetch("/api/dataset/audit")
    .then(r => r.json())
    .then(data => {
      const banner = document.getElementById("qc-banner");
      const statusText = document.getElementById("qc-status-text");
      const summaryText = document.getElementById("qc-summary-text");
      const scoreBadge = document.getElementById("qc-score-badge");

      if (data.audit_status === "PASS") {
        banner.className = "qc-banner pass";
        statusText.textContent = "AUDIT STATUS: PASS";
        summaryText.textContent = "All 12 dataset quality rules satisfied. Zero critical issues detected.";
      } else {
        banner.className = "qc-banner fail";
        statusText.textContent = "AUDIT STATUS: FAIL";
        summaryText.textContent = `${data.failed_checks} checks failed. See diagnostic cards below.`;
      }
      scoreBadge.textContent = `${data.passed_checks} / 12 CHECKS PASSED`;

      const grid = document.getElementById("qc-checks-grid");
      grid.innerHTML = "";
      const checkTitles = {
        "missing_labels": "1. Missing Label Files",
        "invalid_class_ids": "2. Invalid Class IDs",
        "invalid_coords_format": "3. Normalized Coords Format",
        "out_of_bounds_coords": "4. Coordinate Boundary [0,1]",
        "non_positive_dimensions": "5. Positive Width/Height",
        "duplicate_boxes": "6. Duplicate Bounding Boxes",
        "corrupt_images": "7. Corrupt Image Files",
        "unsupported_files": "8. Supported File Formats",
        "empty_annotation_files": "9. Empty Annotation Verification",
        "class_registry_mismatch": "10. Class Registry Integrity",
        "missing_source_metadata": "11. Source Metadata Traceability",
        "split_duplications": "12. Mutual Exclusivity of Splits"
      };

      for (const [key, title] of Object.entries(checkTitles)) {
        const issuesList = (data.issues && data.issues[key]) ? data.issues[key] : [];
        const isOk = issuesList.length === 0;
        const card = document.createElement("div");
        card.className = "qc-card";
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.8rem; font-weight:700; color:#f8fafc;">${title}</span>
            <span class="badge ${isOk ? 'verified' : 'unreviewed'}">${isOk ? 'PASS' : issuesList.length + ' ISSUES'}</span>
          </div>
          <span style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
            ${isOk ? 'No violations detected' : issuesList.slice(0, 2).join('; ')}
          </span>
        `;
        grid.appendChild(card);
      }
    });
}

// -------------------------------------------------------------
// TAB 3: ANNOTATION LOGIC (Preserved Phase 12.2A Decoupled Multi-Box)
// -------------------------------------------------------------
function fetchImages() {
  return fetch(`/api/images?split=${currentSplit}`)
    .then(r => r.json())
    .then(data => {
      imageList = data.images || [];
      document.getElementById("img-total").textContent = imageList.length;
      const imgSelect = document.getElementById("image-select");
      imgSelect.innerHTML = "";
      imageList.forEach((img, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = img.filename;
        imgSelect.appendChild(opt);
      });
      currentIndex = 0;
      if (imageList.length > 0) loadImage();
    });
}

function changeSplit() {
  currentSplit = document.getElementById("split-select").value;
  fetchImages();
}

function reassignSelectedBoxClass() {
  if (selectedBoxId === null) return;
  const box = currentBoxes.find(b => b.id === selectedBoxId);
  if (box) {
    box.classId = selectedClassId;
    const clsObj = classesRegistry.find(c => c.id === selectedClassId);
    box.className = clsObj ? (clsObj.displayName || clsObj.name) : `class_${selectedClassId}`;
    render();
    renderBoxList();
  }
}

function loadImage() {
  if (imageList.length === 0) return;
  const item = imageList[currentIndex];
  document.getElementById("img-index").textContent = currentIndex + 1;
  document.getElementById("image-select").value = currentIndex;
  
  imgElement.onload = () => {
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    canvas.style.aspectRatio = `${imgElement.naturalWidth} / ${imgElement.naturalHeight}`;

    document.getElementById("img-dim-badge").textContent = `Res: ${imgElement.naturalWidth}×${imgElement.naturalHeight}`;
    updateScaleBadge();

    fetch(`/api/label?split=${currentSplit}&filename=${item.filename}`)
      .then(r => r.json())
      .then(data => {
        nextBoxId = 1;
        currentBoxes = (data.boxes || []).map(b => {
          const cid = (b.classId !== undefined) ? b.classId : b.cls;
          const clsObj = classesRegistry.find(c => c.id === cid);
          return {
            id: nextBoxId++,
            classId: cid,
            className: clsObj ? (clsObj.displayName || clsObj.name) : (b.className || `class_${cid}`),
            xc: b.xc,
            yc: b.yc,
            w: b.w,
            h: b.h
          };
        });
        selectedBoxId = null;
        render();
        renderBoxList();
      });
  };
  imgElement.src = `/dataset/images/${currentSplit}/${item.filename}`;
}

function updateScaleBadge() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width && imgElement.naturalWidth) {
    const scalePct = Math.round((rect.width / imgElement.naturalWidth) * 100);
    document.getElementById("scale-badge").textContent = `Fit: ${scalePct}%`;
  }
}

function onWindowResize() {
  updateScaleBadge();
  render();
}

function prevImage() {
  if (currentIndex > 0) { currentIndex--; loadImage(); }
}
function nextImage() {
  if (currentIndex < imageList.length - 1) { currentIndex++; loadImage(); }
}

function getNormalizedCoords(e) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { normX: 0, normY: 0, origX: 0, origY: 0 };
  const normX = Math.max(0.0, Math.min(1.0, (e.clientX - rect.left) / rect.width));
  const normY = Math.max(0.0, Math.min(1.0, (e.clientY - rect.top) / rect.height));
  const origX = Math.round(normX * imgElement.naturalWidth);
  const origY = Math.round(normY * imgElement.naturalHeight);
  return { normX, normY, origX, origY };
}

function render() {
  if (!imgElement.naturalWidth || !imgElement.naturalHeight) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imgElement, 0, 0);

  const rect = canvas.getBoundingClientRect();
  const displayScale = rect.width ? (canvas.width / rect.width) : 1.0;
  const baseLineWidth = Math.max(1, Math.round(2 * displayScale));
  const baseFontSize = Math.max(10, Math.round(13 * displayScale));

  // Render EVERY bounding box with its OWN class and color
  currentBoxes.forEach((b, idx) => {
    const x1 = (b.xc - b.w / 2) * canvas.width;
    const y1 = (b.yc - b.h / 2) * canvas.height;
    const bw = b.w * canvas.width;
    const bh = b.h * canvas.height;
    const color = getClassColor(b.classId);
    const isSelected = (b.id === selectedBoxId);

    ctx.strokeStyle = isSelected ? "#38bdf8" : color;
    ctx.lineWidth = isSelected ? Math.round(3.5 * displayScale) : baseLineWidth;
    ctx.strokeRect(x1, y1, bw, bh);

    const labelText = `#${idx + 1} ${b.className}`;
    ctx.font = `bold ${baseFontSize}px -apple-system, sans-serif`;
    const textWidth = ctx.measureText(labelText).width;
    const pillHeight = baseFontSize + Math.round(8 * displayScale);
    const pillY = Math.max(0, y1 - pillHeight);

    ctx.fillStyle = isSelected ? "#0284c7" : color;
    ctx.fillRect(x1, pillY, textWidth + Math.round(12 * displayScale), pillHeight);

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, x1 + Math.round(6 * displayScale), pillY + pillHeight / 2);
  });

  // Actively dragging preview
  if (isDrawing) {
    const x1 = Math.min(startX, curX) * canvas.width;
    const y1 = Math.min(startY, curY) * canvas.height;
    const bw = Math.abs(curX - startX) * canvas.width;
    const bh = Math.abs(curY - startY) * canvas.height;
    const activeColor = getClassColor(selectedClassId);

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = Math.round(2.5 * displayScale);
    ctx.setLineDash([Math.round(5 * displayScale), Math.round(5 * displayScale)]);
    ctx.strokeRect(x1, y1, bw, bh);
    ctx.setLineDash([]);

    const clsObj = classesRegistry.find(c => c.id === selectedClassId);
    const previewText = clsObj ? (clsObj.displayName || clsObj.name) : `Class ${selectedClassId}`;
    ctx.font = `bold ${baseFontSize}px -apple-system, sans-serif`;
    const textWidth = ctx.measureText(previewText).width;
    const pillHeight = baseFontSize + Math.round(8 * displayScale);
    const pillY = Math.max(0, y1 - pillHeight);

    ctx.fillStyle = activeColor;
    ctx.fillRect(x1, pillY, textWidth + Math.round(12 * displayScale), pillHeight);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(previewText, x1 + Math.round(6 * displayScale), pillY + pillHeight / 2);
  }
}

function renderBoxList() {
  const container = document.getElementById("box-list");
  container.innerHTML = "";
  document.getElementById("box-count").textContent = currentBoxes.length;

  const btnReassign = document.getElementById("btn-reassign");
  if (selectedBoxId !== null) {
    const selBox = currentBoxes.find(b => b.id === selectedBoxId);
    if (selBox) {
      const curCls = classesRegistry.find(c => c.id === selectedClassId);
      const curName = curCls ? (curCls.displayName || curCls.name) : `Class ${selectedClassId}`;
      btnReassign.style.display = "block";
      btnReassign.textContent = `↻ Reassign Box #${currentBoxes.indexOf(selBox) + 1} (${selBox.className}) to ${curName}`;
    } else {
      btnReassign.style.display = "none";
    }
  } else {
    btnReassign.style.display = "none";
  }

  currentBoxes.forEach((b, idx) => {
    const item = document.createElement("div");
    const isSelected = (b.id === selectedBoxId);
    item.className = "box-item" + (isSelected ? " active" : "");
    const origW = Math.round(b.w * imgElement.naturalWidth);
    const origH = Math.round(b.h * imgElement.naturalHeight);

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="color:${getClassColor(b.classId)}; font-weight:700;">
          #${idx + 1} ${b.className}
        </span>
        <span style="color:var(--text-muted); font-family:monospace; font-size:0.72rem;">(${origW}×${origH})</span>
      </div>
      <button class="del-btn" onclick="deleteBoxById(${b.id}, event)" title="Delete Box">✕</button>
    `;
    item.onclick = () => {
      selectedBoxId = (selectedBoxId === b.id) ? null : b.id;
      render();
      renderBoxList();
    };
    container.appendChild(item);
  });
}

function deleteBoxById(id, e) {
  if (e) e.stopPropagation();
  currentBoxes = currentBoxes.filter(b => b.id !== id);
  if (selectedBoxId === id) selectedBoxId = null;
  render();
  renderBoxList();
}
function deleteSelectedBox() {
  if (selectedBoxId !== null) deleteBoxById(selectedBoxId);
}
function clearAllBoxes() {
  if (currentBoxes.length === 0) return;
  if (confirm("Clear all bounding boxes on this frame?")) {
    currentBoxes = [];
    selectedBoxId = null;
    render();
    renderBoxList();
  }
}

// MOUSE EVENTS
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const { normX, normY } = getNormalizedCoords(e);
  startX = normX; startY = normY;
  curX = normX; curY = normY;
  isDrawing = true;
});
canvas.addEventListener("mousemove", (e) => {
  const { normX, normY, origX, origY } = getNormalizedCoords(e);
  cursorOverlay.textContent = `X: ${origX}, Y: ${origY} (${Math.round(normX*100)}%, ${Math.round(normY*100)}%)`;
  if (!isDrawing) return;
  curX = normX; curY = normY;
  render();
});
window.addEventListener("mouseup", (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  const { normX, normY } = getNormalizedCoords(e);
  const x1 = Math.min(startX, normX);
  const y1 = Math.min(startY, normY);
  const w = Math.abs(normX - startX);
  const h = Math.abs(normY - startY);

  if (w > 0.004 && h > 0.004) {
    const creationClassId = selectedClassId;
    const clsObj = classesRegistry.find(c => c.id === creationClassId);
    const newBox = {
      id: nextBoxId++,
      classId: creationClassId,
      className: clsObj ? (clsObj.displayName || clsObj.name) : `class_${creationClassId}`,
      xc: Math.max(0, Math.min(1, x1 + w / 2)),
      yc: Math.max(0, Math.min(1, y1 + h / 2)),
      w: Math.max(0, Math.min(1, w)),
      h: Math.max(0, Math.min(1, h))
    };
    currentBoxes.push(newBox);
    selectedBoxId = newBox.id;
  }
  render();
  renderBoxList();
});

function saveAnnotations() {
  if (imageList.length === 0) return;
  const item = imageList[currentIndex];
  const payloadBoxes = currentBoxes.map(b => ({
    cls: b.classId,
    classId: b.classId,
    className: b.className,
    xc: b.xc, yc: b.yc, w: b.w, h: b.h
  }));

  fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      split: currentSplit,
      filename: item.filename,
      boxes: payloadBoxes,
      is_reviewed: true
    })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      alert("Verified labels saved successfully!");
      loadDatasetSummary();
    } else {
      alert("Error saving labels: " + res.error);
    }
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") { e.preventDefault(); prevImage(); }
    else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") { e.preventDefault(); nextImage(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelectedBox(); }
    else if (e.key === "Escape") { selectedBoxId = null; render(); renderBoxList(); }
    else if (e.ctrlKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); saveAnnotations(); }
  });
}

window.onload = init;
</script>
</body>
</html>
"""

class SafeVisionAnnotationHandler(http.server.SimpleHTTPRequestHandler):
    dataset_dir = DEFAULT_DATASET_DIR

    def _send_json(self, status: int, data: Any):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path in {"/", "/index.html"}:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_TEMPLATE.encode("utf-8"))
            return

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        registry = ClassRegistry(self.dataset_dir)
        media_mgr = MediaManager(self.dataset_dir)
        auditor = DatasetAuditor(self.dataset_dir)

        # GET /api/classes
        if path == "/api/classes":
            only_active = query.get("active", ["false"])[0].lower() == "true"
            self._send_json(200, {"classes": registry.get_classes(active_only=only_active)})
            return

        # GET /api/media
        if path == "/api/media":
            filter_type = query.get("filter", ["all"])[0].lower()
            items = media_mgr.get_library_items(filter_type)
            self._send_json(200, {"filter": filter_type, "items": items})
            return

        # GET /api/dataset/summary
        if path == "/api/dataset/summary":
            self._send_json(200, media_mgr.get_dataset_summary())
            return

        # GET /api/dataset/audit
        if path == "/api/dataset/audit":
            self._send_json(200, auditor.run_audit())
            return

        # GET /api/images
        if path == "/api/images":
            split = query.get("split", ["train"])[0]
            img_dir = os.path.join(self.dataset_dir, "images", split)
            images = []
            if os.path.exists(img_dir):
                for f in sorted(os.listdir(img_dir)):
                    if Path(f).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
                        images.append({"filename": f})
            self._send_json(200, {"split": split, "images": images})
            return

        # GET /api/label
        if path == "/api/label":
            split = query.get("split", ["train"])[0]
            filename = query.get("filename", [""])[0]
            stem = Path(filename).stem
            lbl_path = os.path.join(self.dataset_dir, "labels", split, f"{stem}.txt")
            boxes = []
            is_reviewed = False
            if os.path.exists(lbl_path):
                with open(lbl_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 5:
                            cls_id = int(parts[0])
                            cls_obj = registry.get_class_by_id(cls_id)
                            cls_name = cls_obj["name"] if cls_obj else f"class_{cls_id}"
                            boxes.append({
                                "cls": cls_id,
                                "classId": cls_id,
                                "className": cls_name,
                                "xc": float(parts[1]),
                                "yc": float(parts[2]),
                                "w": float(parts[3]),
                                "h": float(parts[4])
                            })
                log_path = os.path.join(self.dataset_dir, "metadata", "annotation_reviews.json")
                if os.path.exists(log_path):
                    with open(log_path, "r", encoding="utf-8") as rf:
                        try:
                            review_data = json.load(rf)
                            is_reviewed = bool(review_data.get(filename, {}).get("human_verified", False))
                        except Exception:
                            pass

            self._send_json(200, {"boxes": boxes, "is_reviewed": is_reviewed})
            return

        # Serve Images
        if path.startswith("/dataset/images/"):
            rel_path = path[len("/dataset/images/"):]
            full_path = os.path.join(self.dataset_dir, "images", rel_path)
            if os.path.exists(full_path):
                ext = Path(full_path).suffix.lower()
                mime = "image/jpeg"
                if ext == ".png": mime = "image/png"
                elif ext == ".webp": mime = "image/webp"
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.end_headers()
                with open(full_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error(404, "Image not found")
                return

        self.send_error(404, "Endpoint not found")

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        payload = {}
        if post_data:
            try:
                payload = json.loads(post_data.decode("utf-8"))
            except Exception as e:
                self._send_json(400, {"success": False, "error": f"Invalid JSON payload: {e}"})
                return

        registry = ClassRegistry(self.dataset_dir)
        media_mgr = MediaManager(self.dataset_dir)

        # POST /api/classes
        if self.path == "/api/classes":
            name = payload.get("name", "")
            disp = payload.get("displayName", "")
            cat = payload.get("category", "OTHER")
            desc = payload.get("description", "")
            try:
                new_cls = registry.add_class(name, disp, cat, desc)
                self._send_json(200, {"success": True, "class": new_cls})
            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
            return

        # POST /api/classes/toggle
        if self.path == "/api/classes/toggle":
            cid = payload.get("id")
            active = payload.get("active", True)
            try:
                updated = registry.set_class_active(cid, active)
                self._send_json(200, {"success": True, "class": updated})
            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
            return

        # POST /api/media/import_images
        if self.path == "/api/media/import_images":
            files_data = payload.get("files", [])
            target_split = payload.get("split", "train")
            raw_tuples = []
            for item in files_data:
                fname = item.get("filename", "")
                b64 = item.get("data_base64", "")
                if fname and b64:
                    raw_tuples.append((fname, base64.b64decode(b64)))
            imported = media_mgr.import_images(raw_tuples, target_split)
            self._send_json(200, {"success": True, "count": len(imported), "imported": imported})
            return

        # POST /api/media/import_videos
        if self.path == "/api/media/import_videos":
            files_data = payload.get("files", [])
            raw_tuples = []
            for item in files_data:
                fname = item.get("filename", "")
                b64 = item.get("data_base64", "")
                if fname and b64:
                    raw_tuples.append((fname, base64.b64decode(b64)))
            registered = media_mgr.import_videos(raw_tuples)
            self._send_json(200, {"success": True, "count": len(registered), "registered": registered})
            return

        # POST /api/media/extract_frames
        if self.path == "/api/media/extract_frames":
            vname = payload.get("video_filename", "")
            method = payload.get("sample_method", "time")
            interval = float(payload.get("sample_interval", 2.0))
            max_f = int(payload.get("max_frames", 500))
            q_filter = bool(payload.get("quality_filter", True))
            target_split = payload.get("target_split", "train")
            try:
                res = media_mgr.extract_video_frames(vname, method, interval, max_f, q_filter, target_split)
                self._send_json(200, {"success": True, "result": res})
            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
            return

        # POST /api/media/move_split
        if self.path == "/api/media/move_split":
            filename = payload.get("filename", "")
            target_split = payload.get("target_split", "train")
            try:
                res = media_mgr.move_split(filename, target_split)
                self._send_json(200, {"success": True, "result": res})
            except Exception as e:
                self._send_json(400, {"success": False, "error": str(e)})
            return

        # POST /api/save
        if self.path == "/api/save":
            split = payload.get("split", "train")
            filename = payload.get("filename", "")
            boxes = payload.get("boxes", [])
            is_reviewed = payload.get("is_reviewed", True)

            stem = Path(filename).stem
            lbl_path = os.path.join(self.dataset_dir, "labels", split, f"{stem}.txt")

            with open(lbl_path, "w", encoding="utf-8") as f:
                for b in boxes:
                    cls_id = b.get("classId", b.get("cls", 0))
                    f.write(f"{cls_id} {b['xc']:.6f} {b['yc']:.6f} {b['w']:.6f} {b['h']:.6f}\n")

            # Update audit ledger
            log_dir = os.path.join(self.dataset_dir, "metadata")
            os.makedirs(log_dir, exist_ok=True)
            log_path = os.path.join(log_dir, "annotation_reviews.json")
            reviews = {}
            if os.path.exists(log_path):
                with open(log_path, "r", encoding="utf-8") as rf:
                    try: reviews = json.load(rf)
                    except Exception: reviews = {}

            reviews[filename] = {
                "split": split,
                "human_verified": is_reviewed,
                "box_count": len(boxes),
                "timestamp": str(os.path.getmtime(lbl_path))
            }
            with open(log_path, "w", encoding="utf-8") as rf:
                json.dump(reviews, rf, indent=2)

            # Update media manifest box count
            manifest_p = os.path.join(log_dir, "media_manifest.json")
            if os.path.exists(manifest_p):
                with open(manifest_p, "r", encoding="utf-8") as mf:
                    mdata = json.load(mf)
                if filename in mdata.get("mediaItems", {}):
                    mdata["mediaItems"][filename]["boxCount"] = len(boxes)
                    mdata["mediaItems"][filename]["status"] = "HUMAN_VERIFIED" if is_reviewed else "ANNOTATED"
                    with open(manifest_p, "w", encoding="utf-8") as mf:
                        json.dump(mdata, mf, indent=2)

            self._send_json(200, {"success": True})
            return

        self.send_error(404, "Unknown POST route")


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

def run_server(dataset_dir: str, port: int = 8088):
    SafeVisionAnnotationHandler.dataset_dir = dataset_dir
    with ReusableTCPServer(("", port), SafeVisionAnnotationHandler) as httpd:
        print(f"[SafeVision Dataset Suite] Running at http://localhost:{port}")
        print("Navigation: [ Dataset ] [ Media ] [ Annotate ] [ Classes ] [ Quality Control ]")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[SafeVision Dataset Suite] Stopped.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SafeVision Dataset & Annotation Suite")
    parser.add_argument("--dataset-dir", type=str, default=DEFAULT_DATASET_DIR, help="Dataset directory")
    parser.add_argument("--port", type=int, default=8088, help="Server port")
    args = parser.parse_args()

    run_server(args.dataset_dir, args.port)
