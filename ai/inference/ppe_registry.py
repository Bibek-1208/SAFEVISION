#!/usr/bin/env python3
"""
=============================================================================
SafeVision AI — Authoritative PPE Class Registry & Model Class Manifest
Phase 12.2 Configuration-Driven Architecture
=============================================================================
Provides:
1. Dynamic, single-source-of-truth PPE Class Registry with stable 'SV-PPE-xxx' IDs
2. Model Class Index Manifest mapping arbitrary model output indices to SV-PPE IDs
3. Semantic alias resolution and lifecycle management
=============================================================================
"""

import os
import json
import re
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
REGISTRY_PATH = ROOT_DIR / "ai" / "configs" / "ppe_classes_registry.json"
BASELINE_MANIFEST_PATH = ROOT_DIR / "ai" / "models" / "baseline_class_manifest.json"

VALID_CATEGORIES = {
    "PERSON",
    "PPE",
    "ANATOMICAL",
    "ANATOMICAL REFERENCES",
    "EQUIPMENT",
    "HAZARD",
    "HAZARD / OBJECT",
    "OTHER"
}

SAFEVISION_ONTOLOGY = {
    "PERSON": {
        "displayName": "Person / Worker",
        "subCategories": ["Worker / Human Individual"]
    },
    "PPE": {
        "displayName": "Personal Protective Equipment",
        "subCategories": [
            "Head Protection",
            "Eye Protection",
            "Face Protection",
            "Hearing Protection",
            "Respiratory Protection",
            "Hand Protection",
            "Body Protection",
            "Foot Protection",
            "Fall Protection"
        ]
    },
    "ANATOMICAL REFERENCES": {
        "displayName": "Anatomical References",
        "subCategories": [
            "Head",
            "Face",
            "Hands",
            "Feet",
            "Hearing Reference"
        ]
    },
    "HAZARD / OBJECT": {
        "displayName": "Hazard / Object",
        "subCategories": [
            "Hand Tool",
            "Electrical Object",
            "Hazardous Object",
            "Future Classes"
        ]
    }
}

LIFECYCLE_STATUSES = {
    # Phase 12.2 Hardening Required Truthful Lifecycle States
    "NO_TRAINING_DATA",
    "DATA_READY",
    "QUALITY_CHECKING",
    "QUALITY_BLOCKED",
    "TRAINING",
    "EVALUATING",
    "APPROVED",
    "ACTIVE",
    "REJECTED",
    "ARCHIVED",
    "DEACTIVATED",
    # Legacy / Transition Compatibility
    "REGISTERED",
    "DATA_AVAILABLE",
    "TRAINED",
    "VALIDATED",
    "DEPRECATED"
}

class PPEClassRegistry:
    """Authoritative persistent registry for SafeVision PPE classes."""
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(PPEClassRegistry, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, registry_file: Optional[Path] = None):
        if registry_file is not None:
            self.registry_file = Path(registry_file)
            self._ensure_file_exists()
            self._load()
            return

        if getattr(self, "_initialized", False):
            return
        self.registry_file = REGISTRY_PATH
        self._ensure_file_exists()
        self._load()
        self._initialized = True

    def _ensure_file_exists(self):
        if not self.registry_file.exists():
            self.registry_file.parent.mkdir(parents=True, exist_ok=True)
            initial_data = {
                "version": "1.0.0",
                "name": "SafeVision Authoritative PPE Class Registry",
                "classes": []
            }
            with open(self.registry_file, "w", encoding="utf-8") as f:
                json.dump(initial_data, f, indent=2)

    def _load(self):
        with open(self.registry_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.classes: List[Dict[str, Any]] = data.get("classes", [])

    def _save(self):
        self.registry_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": "1.0.0",
            "name": "SafeVision Authoritative PPE Class Registry",
            "classes": self.classes
        }
        with open(self.registry_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    @staticmethod
    def normalize_name(name: str) -> str:
        s = name.strip().lower()
        s = re.sub(r'[\s_]+', '-', s)
        s = re.sub(r'[^a-z0-9\-]', '', s)
        return s

    def get_classes(self, active_only: bool = False) -> List[Dict[str, Any]]:
        self._load()
        if active_only:
            return [c for c in self.classes if c.get("active", True)]
        return list(self.classes)

    def _format_class_record(self, c: Dict[str, Any]) -> Dict[str, Any]:
        res = dict(c)
        if "id" in res and "class_id" not in res:
            res["class_id"] = res["id"]
        if "status" in res and "lifecycle_status" not in res:
            res["lifecycle_status"] = res["status"]
        return res

    def get_class_by_id(self, sv_id: str) -> Optional[Dict[str, Any]]:
        self._load()
        sv_id_upper = sv_id.strip().upper()
        for c in self.classes:
            if c.get("id", "").upper() == sv_id_upper or c.get("class_id", "").upper() == sv_id_upper:
                return self._format_class_record(c)
        return None

    def get_class(self, sv_id: str) -> Optional[Dict[str, Any]]:
        return self.get_class_by_id(sv_id)

    def get_class_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        self._load()
        norm = self.normalize_name(name)
        for c in self.classes:
            if self.normalize_name(c.get("name", "")) == norm:
                return self._format_class_record(c)
        return None

    def resolve_alias(self, query: str) -> Optional[Dict[str, Any]]:
        """Resolves an external class name, colloquial name, or alias to a registered class."""
        self._load()
        q_norm = self.normalize_name(query)
        if not q_norm:
            return None

        # 1. Exact name match
        for c in self.classes:
            if self.normalize_name(c.get("name", "")) == q_norm:
                return dict(c)

        # 2. Display name match
        for c in self.classes:
            if self.normalize_name(c.get("displayName", "")) == q_norm:
                return dict(c)

        # 3. Alias match
        for c in self.classes:
            aliases = [self.normalize_name(a) for a in c.get("aliases", [])]
            if q_norm in aliases:
                return dict(c)

        return None

    def create_class(
        self,
        name: str,
        display_name: str,
        category: str = "PPE",
        description: str = "",
        aliases: Optional[List[str]] = None,
        initial_status: str = "NO_TRAINING_DATA",
        sub_category: Optional[str] = None
    ) -> Dict[str, Any]:
        """Creates a new PPE class with stable auto-incrementing SV-PPE-xxx identifier."""
        self._load()
        norm_name = self.normalize_name(name)
        if not norm_name:
            raise ValueError("Class name cannot be empty or invalid.")

        if self.get_class_by_name(norm_name):
            raise ValueError(f"Class '{norm_name}' already exists in registry.")

        cat_upper = category.strip().upper()
        if cat_upper not in VALID_CATEGORIES:
            cat_upper = "PPE"

        # Determine next ID
        existing_numbers = []
        for c in self.classes:
            cid = c.get("id", "")
            match = re.search(r'SV-PPE-(\d+)', cid)
            if match:
                existing_numbers.append(int(match.group(1)))
        next_num = max(existing_numbers, default=0) + 1
        new_id = f"SV-PPE-{next_num:03d}"

        now_iso = datetime.now(timezone.utc).isoformat()
        clean_aliases = list(set([a.strip() for a in (aliases or []) if a.strip()]))

        new_entry = {
            "id": new_id,
            "name": norm_name,
            "displayName": display_name.strip() or norm_name.capitalize(),
            "category": cat_upper,
            "subCategory": (sub_category.strip() if sub_category else None),
            "description": description.strip(),
            "aliases": clean_aliases,
            "active": True,
            "status": initial_status if initial_status in LIFECYCLE_STATUSES else "NO_TRAINING_DATA",
            "createdAt": now_iso,
            "updatedAt": now_iso
        }

        self.classes.append(new_entry)
        self._save()
        return self._format_class_record(new_entry)

    def register_class(self, *args, **kwargs) -> Dict[str, Any]:
        if "subcategory" in kwargs and "sub_category" not in kwargs:
            kwargs["sub_category"] = kwargs.pop("subcategory")
        return self.create_class(*args, **kwargs)

    def deactivate_class(self, sv_id: str) -> Optional[Dict[str, Any]]:
        self._load()
        sv_id_upper = sv_id.strip().upper()
        for c in self.classes:
            if c.get("id", "").upper() == sv_id_upper:
                c["active"] = False
                c["updatedAt"] = datetime.now(timezone.utc).isoformat()
                self._save()
                return dict(c)
        return None

    def activate_class(self, sv_id: str) -> Optional[Dict[str, Any]]:
        self._load()
        sv_id_upper = sv_id.strip().upper()
        for c in self.classes:
            if c.get("id", "").upper() == sv_id_upper:
                c["active"] = True
                c["updatedAt"] = datetime.now(timezone.utc).isoformat()
                self._save()
                return dict(c)
        return None

    def update_class_status(self, sv_id: str, new_status: str) -> Optional[Dict[str, Any]]:
        if new_status not in LIFECYCLE_STATUSES:
            raise ValueError(f"Invalid status: {new_status}")
        self._load()
        sv_id_upper = sv_id.strip().upper()
        for c in self.classes:
            if c.get("id", "").upper() == sv_id_upper:
                c["status"] = new_status
                # If activated, also set active flag to True
                if new_status == "ACTIVE":
                    c["active"] = True
                elif new_status in ["DEACTIVATED", "ARCHIVED"]:
                    c["active"] = False
                c["updatedAt"] = datetime.now(timezone.utc).isoformat()
                self._save()
                return dict(c)
        return None

    def is_class_active(self, sv_id: str) -> bool:
        """A class is active if registered, active=True, and status == 'ACTIVE'."""
        c = self.get_class_by_id(sv_id)
        if not c:
            return False
        return bool(c.get("active", False) and c.get("status") == "ACTIVE")

    def get_active_classes(self) -> List[Dict[str, Any]]:
        """Returns classes whose status is ACTIVE and active flag is True."""
        self._load()
        return [c for c in self.classes if c.get("active", False) and c.get("status") == "ACTIVE"]


class ModelClassManifest:
    """Decoupled model index mapping: modelIndex -> SafeVision Class ID."""

    def __init__(self, manifest_file: Optional[Path] = None):
        self.manifest_file = Path(manifest_file) if manifest_file else BASELINE_MANIFEST_PATH
        self._load()

    def _load(self):
        if not self.manifest_file.exists():
            self.model_version = "unknown"
            self.model_id = "unknown"
            self.manifest_entries = []
            self.index_map = {}
            return

        with open(self.manifest_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.model_version = data.get("modelVersion", "1.0.0")
        self.model_id = data.get("modelId", "MODEL-PPE-BASELINE-SH17")
        self.manifest_entries: List[Dict[str, Any]] = data.get("classManifest", [])
        self.index_map: Dict[int, Dict[str, Any]] = {
            int(e["modelIndex"]): e for e in self.manifest_entries
        }

    def get_entry(self, model_index: int) -> Optional[Dict[str, Any]]:
        return self.index_map.get(model_index)

    def get_sv_id(self, model_index: int) -> Optional[str]:
        entry = self.get_entry(model_index)
        return entry.get("safeVisionClassId") if entry else None

    def get_class_name(self, model_index: int) -> Optional[str]:
        entry = self.get_entry(model_index)
        return entry.get("className") if entry else None

    def get_display_name(self, model_index: int) -> Optional[str]:
        entry = self.get_entry(model_index)
        return entry.get("displayName") if entry else None

    def get_supported_class_ids(self) -> List[str]:
        return [e.get("safeVisionClassId") for e in self.manifest_entries if e.get("safeVisionClassId")]
